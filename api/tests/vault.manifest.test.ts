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
 * El manifiesto es el inventario CIFRADO del baúl (uid + digest de cada item).
 * Sirve para detectar lo que el AAD por item no cubre: que el server borre
 * filas o devuelva contenido viejo. Aquí se prueba lo que le toca al server:
 * guardarlo opaco, no filtrarlo entre cuentas y no dejar retroceder la versión.
 */
describe('Manifiesto del baúl', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('arranca vacío en una cuenta nueva', async () => {
    const { cookie } = await registerAndLogin(app)

    const res = await request(app).get('/api/vault/manifest').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.manifest).toBeNull()
    expect(res.body.version).toBe(0)
  })

  it('guarda y devuelve el blob tal cual, sin leerlo', async () => {
    const { cookie } = await registerAndLogin(app)
    const manifest = fakeBlob()

    const put = await request(app)
      .put('/api/vault/manifest')
      .set('Cookie', cookie)
      .send({ manifest, version: 1 })

    expect(put.status).toBe(200)

    const res = await request(app).get('/api/vault/manifest').set('Cookie', cookie)
    expect(res.body.manifest).toEqual(manifest)
    expect(res.body.version).toBe(1)
  })

  it('acepta versiones que avanzan', async () => {
    const { cookie } = await registerAndLogin(app)

    for (const version of [1, 2, 7]) {
      const res = await request(app)
        .put('/api/vault/manifest')
        .set('Cookie', cookie)
        .send({ manifest: fakeBlob(), version })
      expect(res.status).toBe(200)
    }

    const res = await request(app).get('/api/vault/manifest').set('Cookie', cookie)
    expect(res.body.version).toBe(7)
  })

  // Sin esto, dos pestañas desincronizadas podrían pisar el manifiesto con uno
  // viejo y disparar una falsa alarma de integridad al recargar.
  it('rechaza retroceder la versión y no toca lo guardado', async () => {
    const { cookie } = await registerAndLogin(app)
    const bueno = fakeBlob()

    await request(app)
      .put('/api/vault/manifest')
      .set('Cookie', cookie)
      .send({ manifest: bueno, version: 5 })

    const viejo = await request(app)
      .put('/api/vault/manifest')
      .set('Cookie', cookie)
      .send({ manifest: fakeBlob(), version: 3 })

    expect(viejo.status).toBe(409)
    expect(viejo.body.version).toBe(5)

    const res = await request(app).get('/api/vault/manifest').set('Cookie', cookie)
    expect(res.body.manifest).toEqual(bueno)
    expect(res.body.version).toBe(5)
  })

  it('rechaza repetir la misma versión con otro contenido', async () => {
    const { cookie } = await registerAndLogin(app)
    const original = fakeBlob()

    await request(app)
      .put('/api/vault/manifest')
      .set('Cookie', cookie)
      .send({ manifest: original, version: 2 })

    const repetido = await request(app)
      .put('/api/vault/manifest')
      .set('Cookie', cookie)
      .send({ manifest: fakeBlob(), version: 2 })

    expect(repetido.status).toBe(409)

    const res = await request(app).get('/api/vault/manifest').set('Cookie', cookie)
    expect(res.body.manifest).toEqual(original)
  })

  it('cada cuenta ve solo su manifiesto', async () => {
    const victima = await registerAndLogin(app)
    const atacante = await registerAndLogin(app)
    const ajeno = fakeBlob()

    await request(app)
      .put('/api/vault/manifest')
      .set('Cookie', victima.cookie)
      .send({ manifest: ajeno, version: 1 })

    const res = await request(app).get('/api/vault/manifest').set('Cookie', atacante.cookie)

    expect(res.body.manifest).toBeNull()
    expect(JSON.stringify(res.body)).not.toContain(ajeno.ct)
  })

  it('escribir el manifiesto de un usuario no toca el de otro', async () => {
    const victima = await registerAndLogin(app)
    const atacante = await registerAndLogin(app)
    const suyo = fakeBlob()

    await request(app)
      .put('/api/vault/manifest')
      .set('Cookie', victima.cookie)
      .send({ manifest: suyo, version: 4 })

    await request(app)
      .put('/api/vault/manifest')
      .set('Cookie', atacante.cookie)
      .send({ manifest: fakeBlob(), version: 9 })

    const res = await request(app).get('/api/vault/manifest').set('Cookie', victima.cookie)
    expect(res.body.manifest).toEqual(suyo)
    expect(res.body.version).toBe(4)
  })

  it('el blob se guarda como texto opaco en BD', async () => {
    const { user, cookie } = await registerAndLogin(app)
    const manifest = fakeBlob()

    await request(app)
      .put('/api/vault/manifest')
      .set('Cookie', cookie)
      .send({ manifest, version: 1 })

    const { rows } = await getTestDb().execute({
      sql: 'SELECT vault_manifest FROM Usuarios WHERE username = ?',
      args: [user.username]
    })

    expect(JSON.parse(String(rows[0].vault_manifest))).toEqual(manifest)
  })

  it('valida la forma del cuerpo', async () => {
    const { cookie } = await registerAndLogin(app)

    const sinVersion = await request(app)
      .put('/api/vault/manifest')
      .set('Cookie', cookie)
      .send({ manifest: fakeBlob() })
    expect(sinVersion.status).toBe(400)

    const versionCero = await request(app)
      .put('/api/vault/manifest')
      .set('Cookie', cookie)
      .send({ manifest: fakeBlob(), version: 0 })
    expect(versionCero.status).toBe(400)

    const sinBlob = await request(app)
      .put('/api/vault/manifest')
      .set('Cookie', cookie)
      .send({ manifest: { iv: '', ct: '' }, version: 1 })
    expect(sinBlob.status).toBe(400)
  })

  it('exige sesión en lectura y escritura', async () => {
    expect((await request(app).get('/api/vault/manifest')).status).toBe(401)
    expect(
      (await request(app).put('/api/vault/manifest').send({ manifest: fakeBlob(), version: 1 }))
        .status
    ).toBe(401)
  })
})
