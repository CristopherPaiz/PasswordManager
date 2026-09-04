import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import type { Request, Response, NextFunction } from 'express'

vi.mock('express-rate-limit', () => ({
  default:
    () =>
    (_req: Request, _res: Response, next: NextFunction): void =>
      next()
}))

const { default: app } = await import('../src/app.js')
const { setupTestDb, resetTestDb, closeTestDb, getTestDb } = await import('./helpers/db.js')
const { buildUser, registerUser, registerAndLogin, fakeBlob, validKdfParams, extractCookie } =
  await import('./helpers/fixtures.js')

// Payload de reseteo: la llave usada se QUEMA, así que el cliente manda el blob
// y el hash de una llave de recuperación NUEVA en la misma petición.
const resetPayload = (
  username: string,
  recovery_auth: string
): Record<string, unknown> & { password: string; new_recovery_auth: string } => {
  const nuevo = buildUser()
  return {
    username,
    recovery_auth,
    password: nuevo.password,
    kdf_salt: nuevo.kdf_salt,
    kdf_params: validKdfParams,
    wrapped_vault_key: fakeBlob(),
    wrapped_vault_key_recovery: fakeBlob(),
    new_recovery_auth: nuevo.recovery_auth
  }
}

describe('POST /api/auth/recovery/start', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('entrega el blob de recuperación de una cuenta existente', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const res = await request(app)
      .post('/api/auth/recovery/start')
      .send({ username: user.username })

    expect(res.status).toBe(200)
    // El blob es inútil sin la llave de recuperación, por eso puede ser público.
    expect(res.body.wrapped_vault_key_recovery).toEqual(user.wrapped_vault_key_recovery)
  })

  it('devuelve un señuelo indistinguible si la cuenta no existe', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const real = await request(app)
      .post('/api/auth/recovery/start')
      .send({ username: user.username })
    const decoy = await request(app)
      .post('/api/auth/recovery/start')
      .send({ username: 'cuenta_fantasma' })

    expect(decoy.status).toBe(real.status)
    expect(Object.keys(decoy.body)).toEqual(Object.keys(real.body))

    // Mismos tamaños: iv de 12 bytes y ct de 48 (32 de llave + 16 de tag GCM).
    // Al cliente le fallará el tag igual que con una llave equivocada.
    const blob = decoy.body.wrapped_vault_key_recovery
    expect(Buffer.from(String(blob.iv), 'base64')).toHaveLength(12)
    expect(Buffer.from(String(blob.ct), 'base64')).toHaveLength(48)
  })

  it('el señuelo es estable por username y distinto entre usernames', async () => {
    const a1 = await request(app).post('/api/auth/recovery/start').send({ username: 'fantasma_a' })
    const a2 = await request(app).post('/api/auth/recovery/start').send({ username: 'fantasma_a' })
    const b1 = await request(app).post('/api/auth/recovery/start').send({ username: 'fantasma_b' })

    expect(a2.body.wrapped_vault_key_recovery).toEqual(a1.body.wrapped_vault_key_recovery)
    expect(b1.body.wrapped_vault_key_recovery).not.toEqual(a1.body.wrapped_vault_key_recovery)
  })
})

describe('POST /api/auth/recovery/reset', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('restablece la maestra con la llave de recuperación correcta', async () => {
    const user = buildUser()
    await registerUser(app, user)
    const payload = resetPayload(user.username, user.recovery_auth)

    const res = await request(app).post('/api/auth/recovery/reset').send(payload)
    expect(res.status).toBe(200)

    // La credencial vieja muere; la nueva entra y trae el blob nuevo.
    const vieja = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.password })
    expect(vieja.status).toBe(401)

    const nueva = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: payload.password })
    expect(nueva.status).toBe(200)
    expect(nueva.body.wrapped_vault_key).toEqual(payload.wrapped_vault_key)
  })

  // Una llave de recuperación robada no debe servir dos veces.
  it('quema la llave usada y activa la nueva', async () => {
    const user = buildUser()
    await registerUser(app, user)
    const primero = resetPayload(user.username, user.recovery_auth)
    await request(app).post('/api/auth/recovery/reset').send(primero)

    const reintento = await request(app)
      .post('/api/auth/recovery/reset')
      .send(resetPayload(user.username, user.recovery_auth))
    expect(reintento.status).toBe(401)

    const conNueva = await request(app)
      .post('/api/auth/recovery/reset')
      .send(resetPayload(user.username, String(primero.new_recovery_auth)))
    expect(conNueva.status).toBe(200)
  })

  it('rechaza una llave de recuperación incorrecta sin tocar la cuenta', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const res = await request(app)
      .post('/api/auth/recovery/reset')
      .send(resetPayload(user.username, 'llave-que-no-es'))

    expect(res.status).toBe(401)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.password })
    expect(login.status).toBe(200)
  })

  it('usa el mismo error para cuenta inexistente y llave incorrecta', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const llaveMala = await request(app)
      .post('/api/auth/recovery/reset')
      .send(resetPayload(user.username, 'llave-que-no-es'))
    const noExiste = await request(app)
      .post('/api/auth/recovery/reset')
      .send(resetPayload('cuenta_fantasma', 'llave-que-no-es'))

    expect(noExiste.status).toBe(llaveMala.status)
    expect(noExiste.body.message).toBe(llaveMala.body.message)
  })

  // Quien recupera la cuenta debe expulsar a quien tuviera sesión abierta.
  it('invalida todas las sesiones activas', async () => {
    const { user, cookie } = await registerAndLogin(app)
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200)

    await request(app)
      .post('/api/auth/recovery/reset')
      .send(resetPayload(user.username, user.recovery_auth))

    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401)
  })

  it('no emite sesión: obliga a volver a entrar con la maestra nueva', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const res = await request(app)
      .post('/api/auth/recovery/reset')
      .send(resetPayload(user.username, user.recovery_auth))

    expect(extractCookie(res.headers['set-cookie'] as unknown as string[])).toBeNull()
  })

  it('aplica el piso de KDF también en el reseteo', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const res = await request(app)
      .post('/api/auth/recovery/reset')
      .send({
        ...resetPayload(user.username, user.recovery_auth),
        kdf_params: { ...validKdfParams, m: 1024 }
      })

    expect(res.status).toBe(400)

    // Y la cuenta quedó intacta.
    const { rows } = await getTestDb().execute('SELECT kdf_salt FROM Usuarios')
    expect(String(rows[0].kdf_salt)).toBe(user.kdf_salt)
  })
})
