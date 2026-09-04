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
const { registerAndLogin, fakeBlob } = await import('./helpers/fixtures.js')

/**
 * GET /api/vault/keys es lo que permite reabrir el baúl tras recargar la página:
 * la sesión sigue viva (cookie) pero la vaultKey murió con la memoria. Devuelve
 * los parámetros para RE-DERIVAR la llave en el cliente, nunca la llave misma.
 */
describe('GET /api/vault/keys', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('devuelve salt, params y la vaultKey envuelta del dueño', async () => {
    const { user, cookie } = await registerAndLogin(app)

    const res = await request(app).get('/api/vault/keys').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.kdf_salt).toBe(user.kdf_salt)
    expect(res.body.kdf_params).toEqual(user.kdf_params)
    expect(res.body.wrapped_vault_key).toEqual(user.wrapped_vault_key)
  })

  // El blob de recovery y el hash de la maestra no tienen nada que hacer aquí.
  it('no expone el blob de recuperación ni la credencial', async () => {
    const { user, cookie } = await registerAndLogin(app)

    const res = await request(app).get('/api/vault/keys').set('Cookie', cookie)

    const body = JSON.stringify(res.body)
    expect(body).not.toContain(user.wrapped_vault_key_recovery.ct)
    expect(body).not.toContain(user.recovery_auth)
    expect(body).not.toContain(user.password)
  })

  it('incluye las passkeys del usuario con su blob envuelto', async () => {
    const { cookie } = await registerAndLogin(app)
    const envuelta = fakeBlob()
    await request(app)
      .post('/api/auth/passkey')
      .set('Cookie', cookie)
      .send({ cred_id: 'cred-laptop', wrapped_vault_key: envuelta, label: 'Laptop' })

    const res = await request(app).get('/api/vault/keys').set('Cookie', cookie)

    expect(res.body.passkeys).toHaveLength(1)
    expect(res.body.passkeys[0].cred_id).toBe('cred-laptop')
    expect(res.body.passkeys[0].wrapped_vault_key).toEqual(envuelta)
  })

  // El navegador elige por `cred_id` la passkey de ESTE dispositivo, así que
  // llegan todas las del usuario... y solo las del usuario.
  it('nunca incluye passkeys de otro usuario', async () => {
    const victima = await registerAndLogin(app)
    const atacante = await registerAndLogin(app)
    const ajena = fakeBlob()

    await request(app)
      .post('/api/auth/passkey')
      .set('Cookie', victima.cookie)
      .send({ cred_id: 'cred-de-la-victima', wrapped_vault_key: ajena })

    const res = await request(app).get('/api/vault/keys').set('Cookie', atacante.cookie)

    expect(res.body.passkeys).toHaveLength(0)
    expect(JSON.stringify(res.body)).not.toContain(ajena.ct)
  })

  it('nunca devuelve la vaultKey envuelta de otro usuario', async () => {
    const victima = await registerAndLogin(app)
    const atacante = await registerAndLogin(app)

    const res = await request(app).get('/api/vault/keys').set('Cookie', atacante.cookie)

    expect(res.body.wrapped_vault_key).not.toEqual(victima.user.wrapped_vault_key)
    expect(res.body.kdf_salt).not.toBe(victima.user.kdf_salt)
  })

  it('devuelve 404 si la cuenta no tiene parámetros cripto', async () => {
    const { user, cookie } = await registerAndLogin(app)
    await getTestDb().execute({
      sql: 'UPDATE Usuarios SET kdf_salt = NULL WHERE username = ?',
      args: [user.username]
    })

    const res = await request(app).get('/api/vault/keys').set('Cookie', cookie)

    expect(res.status).toBe(404)
  })

  it('exige sesión', async () => {
    const res = await request(app).get('/api/vault/keys')
    expect(res.status).toBe(401)
  })
})
