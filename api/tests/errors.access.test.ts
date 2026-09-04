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
const { registerAndLogin } = await import('./helpers/fixtures.js')

const makeAdmin = async (username: string): Promise<void> => {
  await getTestDb().execute({
    sql: "UPDATE Usuarios SET rol = 'admin' WHERE username = ?",
    args: [username]
  })
}

/**
 * Los ErrorLogs traen stack traces: rutas internas, SQL y fragmentos de request.
 * Cualquiera puede registrarse en la app, así que la única barrera es el rol,
 * y el rol se lee de la BD (no del JWT) en cada request.
 */
describe('Acceso a /api/errors', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('un usuario recién registrado nace con rol "user"', async () => {
    const { user } = await registerAndLogin(app)

    const { rows } = await getTestDb().execute({
      sql: 'SELECT rol FROM Usuarios WHERE username = ?',
      args: [user.username]
    })

    expect(String(rows[0].rol)).toBe('user')
  })

  it('un usuario normal recibe 403 y ningún log', async () => {
    const { cookie } = await registerAndLogin(app)
    await getTestDb().execute(
      "INSERT INTO ErrorLogs (endpoint, method, error_message, stack_trace) VALUES ('/api/x', 'GET', 'boom', 'at secreto.ts:42')"
    )

    const res = await request(app).get('/api/errors').set('Cookie', cookie)

    expect(res.status).toBe(403)
    expect(JSON.stringify(res.body)).not.toContain('secreto.ts')
  })

  it('un admin sí los lista', async () => {
    const { user, cookie } = await registerAndLogin(app)
    await makeAdmin(user.username)
    await getTestDb().execute(
      "INSERT INTO ErrorLogs (endpoint, method, error_message, stack_trace) VALUES ('/api/x', 'GET', 'boom', 'at interno.ts:1')"
    )

    const res = await request(app).get('/api/errors').set('Cookie', cookie)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })

  // El middleware consulta el rol en cada request: degradar a un admin surte
  // efecto de inmediato, sin esperar a que expire su token.
  it('quitar el rol admin corta el acceso con el MISMO token', async () => {
    const { user, cookie } = await registerAndLogin(app)
    await makeAdmin(user.username)
    expect((await request(app).get('/api/errors').set('Cookie', cookie)).status).toBe(200)

    await getTestDb().execute({
      sql: "UPDATE Usuarios SET rol = 'user' WHERE username = ?",
      args: [user.username]
    })

    expect((await request(app).get('/api/errors').set('Cookie', cookie)).status).toBe(403)
  })

  it('exige sesión', async () => {
    expect((await request(app).get('/api/errors')).status).toBe(401)
  })

  it('/api/auth/me expone el rol para que la UI no ofrezca pantallas de admin', async () => {
    const { user, cookie } = await registerAndLogin(app)

    const normal = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(normal.body.user.rol).toBe('user')

    await makeAdmin(user.username)
    const admin = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(admin.body.user.rol).toBe('admin')
  })
})
