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
const { registerAndLogin, buildUser, fakeBlob } = await import('./helpers/fixtures.js')

// Parámetros más fuertes que los del registro (m = 65536): a esto migra la cuenta.
const strongerParams = { algo: 'argon2id', m: 131072, t: 4, p: 1, hashLen: 32 } as const

/**
 * PUT /api/auth/kdf endurece el Argon2id de una cuenta vieja SIN cambiar la
 * contraseña maestra: el cliente re-deriva con salt/params nuevos y re-envuelve
 * la MISMA vaultKey. El server solo verifica la credencial actual y persiste.
 */
describe('PUT /api/auth/kdf', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('actualiza salt, params y blob envuelto con la credencial correcta', async () => {
    const { user, cookie } = await registerAndLogin(app)
    const nuevo = buildUser()

    const res = await request(app).put('/api/auth/kdf').set('Cookie', cookie).send({
      current_password: user.password,
      password: nuevo.password,
      kdf_salt: nuevo.kdf_salt,
      kdf_params: strongerParams,
      wrapped_vault_key: nuevo.wrapped_vault_key
    })

    expect(res.status).toBe(200)

    const keys = await request(app).get('/api/vault/keys').set('Cookie', cookie)
    expect(keys.body.kdf_salt).toBe(nuevo.kdf_salt)
    expect(keys.body.kdf_params).toEqual(strongerParams)
    expect(keys.body.wrapped_vault_key).toEqual(nuevo.wrapped_vault_key)
  })

  it('el prelogin ya entrega los parámetros nuevos y el login usa el authHash nuevo', async () => {
    const { user, cookie } = await registerAndLogin(app)
    const nuevo = buildUser()

    await request(app).put('/api/auth/kdf').set('Cookie', cookie).send({
      current_password: user.password,
      password: nuevo.password,
      kdf_salt: nuevo.kdf_salt,
      kdf_params: strongerParams,
      wrapped_vault_key: nuevo.wrapped_vault_key
    })

    const pre = await request(app).post('/api/auth/prelogin').send({ username: user.username })
    expect(pre.body.kdf_params).toEqual(strongerParams)

    const viejo = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.password })
    expect(viejo.status).toBe(401)

    const bueno = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: nuevo.password })
    expect(bueno.status).toBe(200)
  })

  it('rechaza con la credencial actual incorrecta y no cambia nada', async () => {
    const { user, cookie } = await registerAndLogin(app)
    const nuevo = buildUser()

    const res = await request(app).put('/api/auth/kdf').set('Cookie', cookie).send({
      current_password: buildUser().password,
      password: nuevo.password,
      kdf_salt: nuevo.kdf_salt,
      kdf_params: strongerParams,
      wrapped_vault_key: nuevo.wrapped_vault_key
    })

    expect(res.status).toBe(401)

    const keys = await request(app).get('/api/vault/keys').set('Cookie', cookie)
    expect(keys.body.kdf_salt).toBe(user.kdf_salt)
    expect(keys.body.wrapped_vault_key).toEqual(user.wrapped_vault_key)
  })

  // La maestra NO cambió: cerrar las otras sesiones sería un cierre sorpresivo
  // en los demás dispositivos por una migración interna.
  it('no cierra las demás sesiones', async () => {
    const { user, cookie } = await registerAndLogin(app)
    const segunda = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.password })
    const cookie2 = (segunda.headers['set-cookie'] as unknown as string[])[0].split(';')[0]

    const nuevo = buildUser()
    await request(app).put('/api/auth/kdf').set('Cookie', cookie).send({
      current_password: user.password,
      password: nuevo.password,
      kdf_salt: nuevo.kdf_salt,
      kdf_params: strongerParams,
      wrapped_vault_key: nuevo.wrapped_vault_key
    })

    expect((await request(app).get('/api/auth/me').set('Cookie', cookie2)).status).toBe(200)
  })

  // La vaultKey no se rota, así que el blob de recuperación sigue abriéndola.
  it('no toca el blob de recuperación', async () => {
    const { user, cookie } = await registerAndLogin(app)
    const nuevo = buildUser()

    await request(app).put('/api/auth/kdf').set('Cookie', cookie).send({
      current_password: user.password,
      password: nuevo.password,
      kdf_salt: nuevo.kdf_salt,
      kdf_params: strongerParams,
      wrapped_vault_key: nuevo.wrapped_vault_key
    })

    const { rows } = await getTestDb().execute({
      sql: 'SELECT wrapped_vault_key_recovery FROM Usuarios WHERE username = ?',
      args: [user.username]
    })
    expect(JSON.parse(String(rows[0].wrapped_vault_key_recovery))).toEqual(
      user.wrapped_vault_key_recovery
    )
  })

  it('rechaza parámetros KDF por debajo del piso mínimo', async () => {
    const { user, cookie } = await registerAndLogin(app)
    const nuevo = buildUser()

    const res = await request(app)
      .put('/api/auth/kdf')
      .set('Cookie', cookie)
      .send({
        current_password: user.password,
        password: nuevo.password,
        kdf_salt: nuevo.kdf_salt,
        kdf_params: { algo: 'argon2id', m: 1024, t: 1, p: 1, hashLen: 32 },
        wrapped_vault_key: nuevo.wrapped_vault_key
      })

    expect(res.status).toBe(400)
  })

  it('exige sesión', async () => {
    const nuevo = buildUser()
    const res = await request(app).put('/api/auth/kdf').send({
      current_password: nuevo.password,
      password: nuevo.password,
      kdf_salt: nuevo.kdf_salt,
      kdf_params: strongerParams,
      wrapped_vault_key: fakeBlob()
    })

    expect(res.status).toBe(401)
  })
})
