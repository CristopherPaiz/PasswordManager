import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import type { Test } from 'supertest'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'

vi.mock('express-rate-limit', () => ({
  default:
    () =>
    (_req: Request, _res: Response, next: NextFunction): void =>
      next()
}))

const { default: app } = await import('../src/app.js')
const { setupTestDb, resetTestDb, closeTestDb, getTestDb } = await import('./helpers/db.js')
const { buildUser, registerUser, extractCookie } = await import('./helpers/fixtures.js')
const { hashToken } = await import('@utils/crypto.helper.js')
const { MESSAGES, SYSTEM } = await import('@config/constants.js')

const login = (username: string, password: string, token?: string): Test =>
  request(app)
    .post('/api/auth/login')
    .send(token ? { username, password, token } : { username, password })

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('entrega cookie de sesión y la vaultKey envuelta', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const res = await login(user.username, user.password)

    expect(res.status).toBe(200)
    expect(res.body.user.username).toBe(user.username)
    // El cliente desenvuelve la vaultKey con la wrapKey que ya derivó: sin este
    // blob en la respuesta habría un segundo viaje al server.
    expect(res.body.wrapped_vault_key).toEqual(user.wrapped_vault_key)
  })

  it('la cookie es httpOnly y con path raíz', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const res = await login(user.username, user.password)
    const setCookie = res.headers['set-cookie'] as unknown as string[]
    const raw = setCookie.find((c) => c.startsWith(`${SYSTEM.COOKIE_NAME}=`))

    // httpOnly es lo que impide que un XSS lea el token desde JS.
    expect(raw).toMatch(/HttpOnly/i)
    expect(raw).toMatch(/Path=\//i)
  })

  it('guarda el HASH del token en Sesiones, nunca el JWT en claro', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const res = await login(user.username, user.password)
    const cookie = extractCookie(res.headers['set-cookie'] as unknown as string[])
    const token = String(cookie).split('=')[1]

    const { rows } = await getTestDb().execute('SELECT token FROM Sesiones')
    expect(rows).toHaveLength(1)
    const stored = String(rows[0].token)

    // Una fuga de BD no debe entregar tokens usables.
    expect(stored).not.toBe(token)
    expect(stored).toBe(hashToken(token))
    expect(stored).toMatch(/^[a-f0-9]{64}$/)
  })

  it('el JWT lleva el userId y el username', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const res = await login(user.username, user.password)
    const token = String(extractCookie(res.headers['set-cookie'] as unknown as string[])).split(
      '='
    )[1]

    const payload = jwt.verify(token, String(process.env.JWT_SECRET_KEY)) as {
      userId: number
      username: string
    }
    expect(payload.username).toBe(user.username)
    expect(typeof payload.userId).toBe('number')
  })

  it('actualiza ultimo_login', async () => {
    const user = buildUser()
    await registerUser(app, user)

    await login(user.username, user.password)

    const { rows } = await getTestDb().execute('SELECT ultimo_login FROM Usuarios')
    expect(rows[0].ultimo_login).not.toBeNull()
  })

  it('rechaza la contraseña incorrecta sin emitir cookie', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const res = await login(user.username, 'authHash-incorrecto-pero-largo')

    expect(res.status).toBe(401)
    expect(extractCookie(res.headers['set-cookie'] as unknown as string[])).toBeNull()
    const { rows } = await getTestDb().execute('SELECT COUNT(*) as c FROM Sesiones')
    expect(Number(rows[0].c)).toBe(0)
  })

  // Si el mensaje o el status difirieran, el endpoint diría qué cuentas existen.
  it('usa el MISMO error para cuenta inexistente y contraseña mala', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const malPassword = await login(user.username, 'authHash-incorrecto-pero-largo')
    const noExiste = await login('cuenta_fantasma', 'authHash-incorrecto-pero-largo')

    expect(noExiste.status).toBe(malPassword.status)
    expect(noExiste.body.message).toBe(malPassword.body.message)
    expect(malPassword.body.message).toBe(MESSAGES.AUTH.INVALID_CREDENTIALS)
  })

  it('rechaza una cuenta inactiva', async () => {
    const user = buildUser()
    await registerUser(app, user)
    await getTestDb().execute({
      sql: 'UPDATE Usuarios SET activo = 0 WHERE username = ?',
      args: [user.username]
    })

    const res = await login(user.username, user.password)

    expect(res.status).toBe(401)
    expect(res.body.message).toBe(MESSAGES.AUTH.INVALID_CREDENTIALS)
  })

  it('no filtra material sensible en la respuesta', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const res = await login(user.username, user.password)

    const body = JSON.stringify(res.body)
    expect(body).not.toContain(user.password)
    expect(res.body.user.password).toBeUndefined()
    expect(body).not.toContain(user.kdf_salt)
  })

  it('purga sesiones expiradas o cerradas al iniciar sesión', async () => {
    const user = buildUser()
    await registerUser(app, user)
    const { rows: userRows } = await getTestDb().execute('SELECT id FROM Usuarios')
    const userId = Number(userRows[0].id)

    const ayer = new Date(Date.now() - 86400000).toISOString()
    await getTestDb().execute({
      sql: 'INSERT INTO Sesiones (usuario_id, token, fecha_expiracion, activa) VALUES (?, ?, ?, 1)',
      args: [userId, 'hash-expirado', ayer]
    })
    await getTestDb().execute({
      sql: 'INSERT INTO Sesiones (usuario_id, token, fecha_expiracion, activa) VALUES (?, ?, ?, 0)',
      args: [userId, 'hash-cerrado', new Date(Date.now() + 86400000).toISOString()]
    })

    await login(user.username, user.password)

    const { rows } = await getTestDb().execute('SELECT token FROM Sesiones')
    const tokens = rows.map((r) => String(r.token))
    expect(tokens).not.toContain('hash-expirado')
    expect(tokens).not.toContain('hash-cerrado')
    expect(tokens).toHaveLength(1)
  })

  it('exige username y password', async () => {
    const sinPassword = await request(app).post('/api/auth/login').send({ username: 'alguien' })
    expect(sinPassword.status).toBe(400)

    const vacio = await request(app).post('/api/auth/login').send({})
    expect(vacio.status).toBe(400)
  })
})
