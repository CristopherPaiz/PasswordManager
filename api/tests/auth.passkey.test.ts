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
 * Passkeys: una fila por dispositivo con la vaultKey envuelta por el secreto PRF
 * de ESE autenticador. El server nunca abre el blob; solo lo guarda, lo lista y
 * lo borra, y debe hacerlo aislado por usuario.
 */
describe('passkeys', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('registra una passkey y /me la refleja', async () => {
    const { cookie } = await registerAndLogin(app)
    const wrapped = fakeBlob()

    const res = await request(app)
      .post('/api/auth/passkey')
      .set('Cookie', cookie)
      .send({ cred_id: 'cred-abc', wrapped_vault_key: wrapped, label: 'Windows Hello' })

    expect(res.status).toBe(200)

    const { rows } = await getTestDb().execute('SELECT * FROM Passkeys')
    expect(rows).toHaveLength(1)
    expect(JSON.parse(String(rows[0].wrapped_vault_key))).toEqual(wrapped)

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(me.body.user.passkeyEnabled).toBe(true)
  })

  it('el listado devuelve metadatos y nunca el blob envuelto', async () => {
    const { cookie } = await registerAndLogin(app)
    await request(app)
      .post('/api/auth/passkey')
      .set('Cookie', cookie)
      .send({ cred_id: 'cred-abc', wrapped_vault_key: fakeBlob(), label: 'Laptop' })

    const res = await request(app).get('/api/auth/passkeys').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.passkeys).toHaveLength(1)
    expect(res.body.passkeys[0].label).toBe('Laptop')
    expect(res.body.passkeys[0].wrapped_vault_key).toBeUndefined()
    expect(res.body.passkeys[0].cred_id).toBeUndefined()
  })

  // Re-registrar el mismo autenticador (p. ej. tras cambiar la maestra) debe
  // actualizar el blob, no acumular filas muertas.
  it('re-registrar el mismo cred_id actualiza en vez de duplicar', async () => {
    const { cookie } = await registerAndLogin(app)
    const nuevo = fakeBlob()

    await request(app)
      .post('/api/auth/passkey')
      .set('Cookie', cookie)
      .send({ cred_id: 'cred-abc', wrapped_vault_key: fakeBlob(), label: 'Antes' })
    await request(app)
      .post('/api/auth/passkey')
      .set('Cookie', cookie)
      .send({ cred_id: 'cred-abc', wrapped_vault_key: nuevo, label: 'Después' })

    const { rows } = await getTestDb().execute('SELECT * FROM Passkeys')
    expect(rows).toHaveLength(1)
    expect(String(rows[0].label)).toBe('Después')
    expect(JSON.parse(String(rows[0].wrapped_vault_key))).toEqual(nuevo)
  })

  it('admite varias passkeys por usuario (una por dispositivo)', async () => {
    const { cookie } = await registerAndLogin(app)

    for (const cred of ['cred-laptop', 'cred-telefono']) {
      await request(app)
        .post('/api/auth/passkey')
        .set('Cookie', cookie)
        .send({ cred_id: cred, wrapped_vault_key: fakeBlob(), label: cred })
    }

    const res = await request(app).get('/api/auth/passkeys').set('Cookie', cookie)
    expect(res.body.passkeys).toHaveLength(2)
  })

  it('cada usuario solo ve sus passkeys', async () => {
    const primero = await registerAndLogin(app)
    const segundo = await registerAndLogin(app)

    await request(app)
      .post('/api/auth/passkey')
      .set('Cookie', primero.cookie)
      .send({ cred_id: 'cred-del-primero', wrapped_vault_key: fakeBlob() })

    const res = await request(app).get('/api/auth/passkeys').set('Cookie', segundo.cookie)
    expect(res.body.passkeys).toHaveLength(0)

    const me = await request(app).get('/api/auth/me').set('Cookie', segundo.cookie)
    expect(me.body.user.passkeyEnabled).toBe(false)
  })

  it('borrar una passkey propia la elimina', async () => {
    const { cookie } = await registerAndLogin(app)
    await request(app)
      .post('/api/auth/passkey')
      .set('Cookie', cookie)
      .send({ cred_id: 'cred-abc', wrapped_vault_key: fakeBlob() })

    const lista = await request(app).get('/api/auth/passkeys').set('Cookie', cookie)
    const id = Number(lista.body.passkeys[0].id)

    const res = await request(app).delete(`/api/auth/passkey/${id}`).set('Cookie', cookie)
    expect(res.status).toBe(200)

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(me.body.user.passkeyEnabled).toBe(false)
  })

  it('no se puede borrar la passkey de otro usuario', async () => {
    const victima = await registerAndLogin(app)
    const atacante = await registerAndLogin(app)

    await request(app)
      .post('/api/auth/passkey')
      .set('Cookie', victima.cookie)
      .send({ cred_id: 'cred-victima', wrapped_vault_key: fakeBlob() })

    const lista = await request(app).get('/api/auth/passkeys').set('Cookie', victima.cookie)
    const id = Number(lista.body.passkeys[0].id)

    const res = await request(app).delete(`/api/auth/passkey/${id}`).set('Cookie', atacante.cookie)

    expect(res.status).toBe(404)
    const { rows } = await getTestDb().execute('SELECT COUNT(*) as c FROM Passkeys')
    expect(Number(rows[0].c)).toBe(1)
  })

  it('los endpoints de passkey exigen sesión', async () => {
    expect((await request(app).get('/api/auth/passkeys')).status).toBe(401)
    expect(
      (
        await request(app)
          .post('/api/auth/passkey')
          .send({ cred_id: 'x', wrapped_vault_key: fakeBlob() })
      ).status
    ).toBe(401)
    expect((await request(app).delete('/api/auth/passkey/1')).status).toBe(401)
  })

  it('valida el payload de registro', async () => {
    const { cookie } = await registerAndLogin(app)

    const sinBlob = await request(app)
      .post('/api/auth/passkey')
      .set('Cookie', cookie)
      .send({ cred_id: 'cred-abc' })
    expect(sinBlob.status).toBe(400)

    const blobMalo = await request(app)
      .post('/api/auth/passkey')
      .set('Cookie', cookie)
      .send({ cred_id: 'cred-abc', wrapped_vault_key: { iv: '', ct: '' } })
    expect(blobMalo.status).toBe(400)
  })
})
