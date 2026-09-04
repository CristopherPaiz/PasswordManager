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
const { setupTestDb, resetTestDb, closeTestDb } = await import('./helpers/db.js')
const { buildUser, registerUser, validKdfParams } = await import('./helpers/fixtures.js')

/**
 * El prelogin entrega salt + params del KDF. Su propiedad de seguridad no es el
 * secreto (los salts no lo son) sino la INDISTINGUIBILIDAD: la respuesta para
 * una cuenta inexistente debe verse igual que la de una real, o el endpoint se
 * convierte en un enumerador de usuarios.
 */
describe('POST /api/auth/prelogin', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('devuelve el salt y los params reales de una cuenta existente', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const res = await request(app).post('/api/auth/prelogin').send({ username: user.username })

    expect(res.status).toBe(200)
    expect(res.body.kdf_salt).toBe(user.kdf_salt)
    expect(res.body.kdf_params).toEqual(validKdfParams)
  })

  it('responde 200 con un señuelo si la cuenta no existe (anti-enumeración)', async () => {
    const res = await request(app).post('/api/auth/prelogin').send({ username: 'no_existe' })

    expect(res.status).toBe(200)
    expect(typeof res.body.kdf_salt).toBe('string')
    expect(res.body.kdf_params).toEqual(validKdfParams)
  })

  it('el señuelo es estable para el mismo username', async () => {
    const primera = await request(app).post('/api/auth/prelogin').send({ username: 'fantasma' })
    const segunda = await request(app).post('/api/auth/prelogin').send({ username: 'fantasma' })

    // Si variara entre llamadas, un atacante distinguiría cuentas reales
    // (salt fijo) de inexistentes (salt cambiante).
    expect(segunda.body.kdf_salt).toBe(primera.body.kdf_salt)
  })

  it('el señuelo es distinto entre usernames distintos', async () => {
    const a = await request(app).post('/api/auth/prelogin').send({ username: 'fantasma_a' })
    const b = await request(app).post('/api/auth/prelogin').send({ username: 'fantasma_b' })

    expect(a.body.kdf_salt).not.toBe(b.body.kdf_salt)
  })

  it('el señuelo tiene la misma forma que un salt real', async () => {
    const user = buildUser()
    await registerUser(app, user)

    const real = await request(app).post('/api/auth/prelogin').send({ username: user.username })
    const decoy = await request(app).post('/api/auth/prelogin').send({ username: 'no_existe' })

    expect(Object.keys(decoy.body).sort()).toEqual(Object.keys(real.body).sort())
    expect(Buffer.from(String(decoy.body.kdf_salt), 'base64')).toHaveLength(
      Buffer.from(String(real.body.kdf_salt), 'base64').length
    )
  })

  it('una cuenta inactiva se comporta como inexistente', async () => {
    const user = buildUser()
    await registerUser(app, user)
    const { getTestDb } = await import('./helpers/db.js')
    await getTestDb().execute({
      sql: 'UPDATE Usuarios SET activo = 0 WHERE username = ?',
      args: [user.username]
    })

    const res = await request(app).post('/api/auth/prelogin').send({ username: user.username })

    expect(res.status).toBe(200)
    expect(res.body.kdf_salt).not.toBe(user.kdf_salt)
  })
})
