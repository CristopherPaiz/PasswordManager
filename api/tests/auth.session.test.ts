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
const { buildUser, registerAndLogin, extractCookie, fakeBlob, validKdfParams } =
  await import('./helpers/fixtures.js')

/**
 * Segundo login del MISMO usuario (simula otro dispositivo).
 *
 * El `sleep` no es adorno: el JWT solo lleva `{ userId, username, iat, exp }` y
 * `iat` tiene resolución de un segundo, así que dos logins dentro del mismo
 * segundo generan un token IDÉNTICO — y con él, dos filas de Sesiones con el
 * mismo hash, indistinguibles para revocar. Esperar cruza el borde de segundo y
 * da dos sesiones de verdad distintas.
 */
const loginAgain = async (username: string, password: string): Promise<string> => {
  await new Promise((resolve) => setTimeout(resolve, 1100))
  const res = await request(app).post('/api/auth/login').send({ username, password })
  return String(extractCookie(res.headers['set-cookie'] as unknown as string[]))
}

describe('sesión: /me, logout, listado y revocación', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('GET /me sin cookie responde 401', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('GET /me con cookie devuelve el perfil y las banderas de 2FA/passkey', async () => {
    const { user, cookie } = await registerAndLogin(app)

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.user.username).toBe(user.username)
    expect(res.body.user.totpEnabled).toBe(false)
    expect(res.body.user.passkeyEnabled).toBe(false)
    // El perfil nunca debe cargar el hash de la contraseña ni material del baúl.
    expect(res.body.user.password).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toContain(user.password)
  })

  it('GET /me con un token que no es un JWT válido responde 403', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'token=no.es.un.jwt')
    expect(res.status).toBe(403)
  })

  it('GET /me de una cuenta desactivada responde 403', async () => {
    const { user, cookie } = await registerAndLogin(app)
    await getTestDb().execute({
      sql: 'UPDATE Usuarios SET activo = 0 WHERE username = ?',
      args: [user.username]
    })

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })

  // El logout tiene que invalidar la sesión EN BD: borrar la cookie del cliente
  // no sirve de nada si el token sigue siendo aceptado.
  it('logout invalida la sesión del lado servidor', async () => {
    const { cookie } = await registerAndLogin(app)

    const antes = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(antes.status).toBe(200)

    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie)
    expect(out.status).toBe(200)

    const { rows } = await getTestDb().execute('SELECT activa FROM Sesiones')
    expect(Number(rows[0].activa)).toBe(0)

    const despues = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(despues.status).toBe(401)
  })

  it('GET /sessions lista las activas, marca la actual y no expone el token', async () => {
    const { user, cookie } = await registerAndLogin(app)
    await loginAgain(user.username, user.password)

    const res = await request(app).get('/api/auth/sessions').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.sessions).toHaveLength(2)
    expect(res.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1)
    expect(JSON.stringify(res.body)).not.toContain(cookie.split('=')[1])
  })

  it('revocar una sesión deja su cookie inservible', async () => {
    const { user, cookie } = await registerAndLogin(app)
    const otraCookie = await loginAgain(user.username, user.password)

    const lista = await request(app).get('/api/auth/sessions').set('Cookie', cookie)
    const otra = lista.body.sessions.find((s: { current: boolean }) => !s.current)

    const res = await request(app).delete(`/api/auth/sessions/${otra.id}`).set('Cookie', cookie)
    expect(res.status).toBe(200)

    expect((await request(app).get('/api/auth/me').set('Cookie', otraCookie)).status).toBe(401)
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200)
  })

  it('no se puede revocar la sesión de otro usuario', async () => {
    const victima = await registerAndLogin(app)
    const atacante = await registerAndLogin(app)

    const { rows } = await getTestDb().execute({
      sql: 'SELECT s.id FROM Sesiones s JOIN Usuarios u ON u.id = s.usuario_id WHERE u.username = ?',
      args: [victima.user.username]
    })

    const res = await request(app)
      .delete(`/api/auth/sessions/${Number(rows[0].id)}`)
      .set('Cookie', atacante.cookie)

    expect(res.status).toBe(404)
    // Y la sesión de la víctima sigue viva.
    expect((await request(app).get('/api/auth/me').set('Cookie', victima.cookie)).status).toBe(200)
  })

  it('un usuario no ve las sesiones de otro', async () => {
    const primero = await registerAndLogin(app)
    await registerAndLogin(app)

    const res = await request(app).get('/api/auth/sessions').set('Cookie', primero.cookie)

    expect(res.body.sessions).toHaveLength(1)
  })
})

describe('PUT /api/auth/master (cambio de maestra)', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  const nuevaMaestra = (): {
    password: string
    kdf_salt: string
    kdf_params: typeof validKdfParams
    wrapped_vault_key: { iv: string; ct: string }
  } => {
    const nuevo = buildUser()
    return {
      password: nuevo.password,
      kdf_salt: nuevo.kdf_salt,
      kdf_params: validKdfParams,
      wrapped_vault_key: fakeBlob()
    }
  }

  it('cambia la credencial y rota salt y vaultKey envuelta', async () => {
    const { user, cookie } = await registerAndLogin(app)
    const nueva = nuevaMaestra()

    const res = await request(app)
      .put('/api/auth/master')
      .set('Cookie', cookie)
      .send({ current_password: user.password, ...nueva })

    expect(res.status).toBe(200)

    // La credencial vieja ya no entra; la nueva sí, y devuelve el blob nuevo.
    const vieja = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.password })
    expect(vieja.status).toBe(401)

    const conNueva = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: nueva.password })
    expect(conNueva.status).toBe(200)
    expect(conNueva.body.wrapped_vault_key).toEqual(nueva.wrapped_vault_key)

    const prelogin = await request(app).post('/api/auth/prelogin').send({ username: user.username })
    expect(prelogin.body.kdf_salt).toBe(nueva.kdf_salt)
  })

  it('rechaza si la maestra actual es incorrecta', async () => {
    const { user, cookie } = await registerAndLogin(app)
    const nueva = nuevaMaestra()

    const res = await request(app)
      .put('/api/auth/master')
      .set('Cookie', cookie)
      .send({ current_password: 'authHash-que-no-es', ...nueva })

    expect(res.status).toBe(401)

    // Nada cambió: la credencial original sigue sirviendo.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: user.username, password: user.password })
    expect(login.status).toBe(200)
  })

  it('exige sesión', async () => {
    const res = await request(app)
      .put('/api/auth/master')
      .send({ current_password: 'x', ...nuevaMaestra() })

    expect(res.status).toBe(401)
  })

  // Si una sesión estaba comprometida, cambiar la maestra debe expulsarla.
  it('cierra las demás sesiones y conserva la actual', async () => {
    const { user, cookie } = await registerAndLogin(app)
    const otraCookie = await loginAgain(user.username, user.password)

    await request(app)
      .put('/api/auth/master')
      .set('Cookie', cookie)
      .send({ current_password: user.password, ...nuevaMaestra() })

    expect((await request(app).get('/api/auth/me').set('Cookie', otraCookie)).status).toBe(401)
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200)
  })
})
