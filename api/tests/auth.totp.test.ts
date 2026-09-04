import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import { generate as generateTotp } from 'otplib'
import type { Request, Response, NextFunction } from 'express'

vi.mock('express-rate-limit', () => ({
  default:
    () =>
    (_req: Request, _res: Response, next: NextFunction): void =>
      next()
}))

const { default: app } = await import('../src/app.js')
const { setupTestDb, resetTestDb, closeTestDb, getTestDb } = await import('./helpers/db.js')
const { registerAndLogin, extractCookie } = await import('./helpers/fixtures.js')
const { isEncryptedSecret, decryptSecret } = await import('@utils/crypto.helper.js')

// Activa el 2FA de punta a punta y devuelve el secreto en claro para poder
// fabricar códigos válidos en los tests.
const enableTotp = async (cookie: string): Promise<string> => {
  const setup = await request(app).post('/api/auth/totp/setup').set('Cookie', cookie)
  const secret = String(setup.body.secret)

  const token = await generateTotp({ secret })
  const enable = await request(app)
    .post('/api/auth/totp/enable')
    .set('Cookie', cookie)
    .send({ token })

  if (enable.status !== 200) {
    throw new Error(`enableTotp falló: ${JSON.stringify(enable.body)}`)
  }
  return secret
}

describe('TOTP: alta, verificación y baja', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('setup devuelve otpauth + QR y deja el 2FA todavía inactivo', async () => {
    const { cookie } = await registerAndLogin(app)

    const res = await request(app).post('/api/auth/totp/setup').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.otpauth).toMatch(/^otpauth:\/\/totp\//)
    expect(res.body.qr).toMatch(/^data:image\/png;base64,/)

    // El secreto es provisional: no vale hasta verificar un código.
    const { rows } = await getTestDb().execute('SELECT totp_enabled FROM Usuarios')
    expect(Number(rows[0].totp_enabled)).toBe(0)
  })

  // Una fuga de BD no debe entregar los secretos TOTP en claro.
  it('guarda el secreto cifrado, no en texto plano', async () => {
    const { cookie } = await registerAndLogin(app)

    const res = await request(app).post('/api/auth/totp/setup').set('Cookie', cookie)
    const secret = String(res.body.secret)

    const { rows } = await getTestDb().execute('SELECT totp_secret FROM Usuarios')
    const stored = String(rows[0].totp_secret)

    expect(stored).not.toBe(secret)
    expect(isEncryptedSecret(stored)).toBe(true)
    expect(decryptSecret(stored)).toBe(secret)
  })

  it('setup exige sesión', async () => {
    const res = await request(app).post('/api/auth/totp/setup')
    expect(res.status).toBe(401)
  })

  it('enable rechaza un código inválido y no activa el 2FA', async () => {
    const { cookie } = await registerAndLogin(app)
    await request(app).post('/api/auth/totp/setup').set('Cookie', cookie)

    const res = await request(app)
      .post('/api/auth/totp/enable')
      .set('Cookie', cookie)
      .send({ token: '000000' })

    expect(res.status).toBe(400)
    const { rows } = await getTestDb().execute('SELECT totp_enabled FROM Usuarios')
    expect(Number(rows[0].totp_enabled)).toBe(0)
  })

  it('enable con código válido activa el 2FA y /me lo refleja', async () => {
    const { cookie } = await registerAndLogin(app)
    await enableTotp(cookie)

    const { rows } = await getTestDb().execute('SELECT totp_enabled FROM Usuarios')
    expect(Number(rows[0].totp_enabled)).toBe(1)

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(me.body.user.totpEnabled).toBe(true)
  })

  it('no se puede volver a hacer setup con el 2FA ya activo', async () => {
    const { cookie } = await registerAndLogin(app)
    await enableTotp(cookie)

    const res = await request(app).post('/api/auth/totp/setup').set('Cookie', cookie)
    expect(res.status).toBe(400)
  })

  it('enable sin haber hecho setup responde 400', async () => {
    const { cookie } = await registerAndLogin(app)

    const res = await request(app)
      .post('/api/auth/totp/enable')
      .set('Cookie', cookie)
      .send({ token: '123456' })

    expect(res.status).toBe(400)
  })

  it('rechaza códigos con formato inválido', async () => {
    const { cookie } = await registerAndLogin(app)
    await request(app).post('/api/auth/totp/setup').set('Cookie', cookie)

    for (const token of ['12345', '1234567', 'abcdef', '']) {
      const res = await request(app)
        .post('/api/auth/totp/enable')
        .set('Cookie', cookie)
        .send({ token })
      expect(res.status).toBe(400)
    }
  })
})

describe('TOTP en el login', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  // El punto crítico: sin segundo factor NO puede haber cookie de sesión.
  it('con 2FA activo y sin código no emite sesión', async () => {
    const { user, cookie } = await registerAndLogin(app)
    await enableTotp(cookie)

    await getTestDb().execute('DELETE FROM Sesiones')

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.password })

    expect(res.status).toBe(200)
    expect(res.body.totpRequired).toBe(true)
    expect(res.body.wrapped_vault_key).toBeUndefined()
    expect(extractCookie(res.headers['set-cookie'] as unknown as string[])).toBeNull()

    const { rows } = await getTestDb().execute('SELECT COUNT(*) as c FROM Sesiones')
    expect(Number(rows[0].c)).toBe(0)
  })

  it('con código incorrecto responde 401 y no emite sesión', async () => {
    const { user, cookie } = await registerAndLogin(app)
    await enableTotp(cookie)
    await getTestDb().execute('DELETE FROM Sesiones')

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.password, token: '000000' })

    expect(res.status).toBe(401)
    expect(extractCookie(res.headers['set-cookie'] as unknown as string[])).toBeNull()
    const { rows } = await getTestDb().execute('SELECT COUNT(*) as c FROM Sesiones')
    expect(Number(rows[0].c)).toBe(0)
  })

  it('con código válido entrega la sesión y la vaultKey envuelta', async () => {
    const { user, cookie } = await registerAndLogin(app)
    const secret = await enableTotp(cookie)

    const token = await generateTotp({ secret })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.password, token })

    expect(res.status).toBe(200)
    expect(res.body.wrapped_vault_key).toEqual(user.wrapped_vault_key)
    expect(extractCookie(res.headers['set-cookie'] as unknown as string[])).not.toBeNull()
  })

  // Fallback LEGACY: secretos guardados en claro antes de habilitar el cifrado
  // deben seguir funcionando y re-cifrarse en el primer login exitoso.
  it('re-cifra un secreto legacy en texto plano tras un login válido', async () => {
    const { user, cookie } = await registerAndLogin(app)
    const secret = await enableTotp(cookie)

    await getTestDb().execute({
      sql: 'UPDATE Usuarios SET totp_secret = ? WHERE username = ?',
      args: [secret, user.username]
    })

    const token = await generateTotp({ secret })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.password, token })

    expect(res.status).toBe(200)

    const { rows } = await getTestDb().execute('SELECT totp_secret FROM Usuarios')
    const stored = String(rows[0].totp_secret)
    expect(isEncryptedSecret(stored)).toBe(true)
    expect(decryptSecret(stored)).toBe(secret)
  })
})

describe('POST /api/auth/totp/disable', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('desactiva el 2FA y borra el secreto con un código válido', async () => {
    const { cookie } = await registerAndLogin(app)
    const secret = await enableTotp(cookie)

    const token = await generateTotp({ secret })
    const res = await request(app)
      .post('/api/auth/totp/disable')
      .set('Cookie', cookie)
      .send({ token })

    expect(res.status).toBe(200)
    const { rows } = await getTestDb().execute('SELECT totp_enabled, totp_secret FROM Usuarios')
    expect(Number(rows[0].totp_enabled)).toBe(0)
    expect(rows[0].totp_secret).toBeNull()
  })

  // Con la sesión abierta en un equipo ajeno, apagar el 2FA sin código sería
  // quitarle el candado a la cuenta.
  it('rechaza desactivar con un código inválido', async () => {
    const { cookie } = await registerAndLogin(app)
    await enableTotp(cookie)

    const res = await request(app)
      .post('/api/auth/totp/disable')
      .set('Cookie', cookie)
      .send({ token: '000000' })

    expect(res.status).toBe(400)
    const { rows } = await getTestDb().execute('SELECT totp_enabled FROM Usuarios')
    expect(Number(rows[0].totp_enabled)).toBe(1)
  })

  it('responde 400 si el 2FA no está activo', async () => {
    const { cookie } = await registerAndLogin(app)

    const res = await request(app)
      .post('/api/auth/totp/disable')
      .set('Cookie', cookie)
      .send({ token: '123456' })

    expect(res.status).toBe(400)
  })

  it('exige sesión', async () => {
    const res = await request(app).post('/api/auth/totp/disable').send({ token: '123456' })
    expect(res.status).toBe(401)
  })
})
