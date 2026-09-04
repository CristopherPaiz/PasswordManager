import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import { compare as bcryptCompare } from '@node-rs/bcrypt'
import type { Request, Response, NextFunction } from 'express'

// Los límites por IP/cuenta se prueban aparte (auth.rate-limit.test.ts). Aquí
// estorbarían: un archivo hace más peticiones que la ventana permitida.
vi.mock('express-rate-limit', () => ({
  default:
    () =>
    (_req: Request, _res: Response, next: NextFunction): void =>
      next()
}))

const { default: app } = await import('../src/app.js')
const { setupTestDb, resetTestDb, closeTestDb, getTestDb } = await import('./helpers/db.js')
const { buildUser, registerUser, validKdfParams } = await import('./helpers/fixtures.js')

describe('POST /api/auth/register', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('crea la cuenta y guarda los parámetros cripto del baúl', async () => {
    const user = buildUser()

    const res = await request(app).post('/api/auth/register').send(user)

    expect(res.status).toBe(201)
    expect(res.body.user).toMatchObject({ username: user.username, email: user.email })

    const { rows } = await getTestDb().execute({
      sql: 'SELECT * FROM Usuarios WHERE username = ?',
      args: [user.username]
    })
    expect(rows).toHaveLength(1)
    expect(String(rows[0].kdf_salt)).toBe(user.kdf_salt)
    expect(JSON.parse(String(rows[0].kdf_params))).toEqual(validKdfParams)
    expect(JSON.parse(String(rows[0].wrapped_vault_key))).toEqual(user.wrapped_vault_key)
    expect(JSON.parse(String(rows[0].wrapped_vault_key_recovery))).toEqual(
      user.wrapped_vault_key_recovery
    )
  })

  it('nunca guarda el authHash en claro: lo bcrypt-ea', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const { rows } = await getTestDb().execute({
      sql: 'SELECT password, recovery_hash FROM Usuarios WHERE username = ?',
      args: [user.username]
    })

    const stored = String(rows[0].password)
    expect(stored).not.toBe(user.password)
    expect(stored.startsWith('$2')).toBe(true)
    expect(await bcryptCompare(user.password, stored)).toBe(true)

    // Igual con la prueba de posesión de la llave de recuperación.
    const storedRecovery = String(rows[0].recovery_hash)
    expect(storedRecovery).not.toBe(user.recovery_auth)
    expect(await bcryptCompare(user.recovery_auth, storedRecovery)).toBe(true)
  })

  it('la respuesta no filtra material sensible', async () => {
    const user = buildUser()
    const res = await request(app).post('/api/auth/register').send(user)

    const body = JSON.stringify(res.body)
    expect(body).not.toContain(user.password)
    expect(body).not.toContain(user.recovery_auth)
    expect(res.body.user.password).toBeUndefined()
  })

  it('rechaza username duplicado con 409', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const res = await request(app)
      .post('/api/auth/register')
      .send(buildUser({ username: user.username }))

    expect(res.status).toBe(409)
  })

  it('rechaza email duplicado con 409', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const res = await request(app)
      .post('/api/auth/register')
      .send(buildUser({ email: user.email }))

    expect(res.status).toBe(409)
  })

  it('normaliza el username a minúsculas', async () => {
    const user = buildUser({ username: 'MiUsuario' })
    await registerUser(app, user)

    const { rows } = await getTestDb().execute('SELECT username FROM Usuarios')
    expect(String(rows[0].username)).toBe('miusuario')
  })

  // El piso de KDF es la defensa de fondo del modelo zero-knowledge: si la BD se
  // filtra, params débiles hacen el baúl rompible por fuerza bruta. Un cliente
  // manipulado no debe poder registrarse con Argon2 trivial.
  it.each([
    ['memoria por debajo del piso', { ...validKdfParams, m: 1024 }],
    ['iteraciones por debajo del piso', { ...validKdfParams, t: 1 }],
    ['hashLen distinto de 32', { ...validKdfParams, hashLen: 16 }],
    ['algoritmo no soportado', { ...validKdfParams, algo: 'pbkdf2' }]
  ])('rechaza KDF inseguro: %s', async (_caso, kdf_params) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...buildUser(), kdf_params })

    expect(res.status).toBe(400)
    const { rows } = await getTestDb().execute('SELECT COUNT(*) as c FROM Usuarios')
    expect(Number(rows[0].c)).toBe(0)
  })

  it.each([
    ['username con caracteres inválidos', { username: 'con espacio' }],
    ['username muy corto', { username: 'ab' }],
    ['email inválido', { email: 'no-es-un-correo' }],
    ['authHash demasiado corto', { password: 'corto' }]
  ])('rechaza payload inválido: %s', async (_caso, override) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(buildUser(override as Record<string, string>))

    expect(res.status).toBe(400)
    expect(res.body.errors).toBeDefined()
  })
})
