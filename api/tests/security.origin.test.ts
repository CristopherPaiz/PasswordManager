import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import type { Request, Response, NextFunction } from 'express'

vi.mock('express-rate-limit', () => ({
  default:
    () =>
    (_req: Request, _res: Response, next: NextFunction): void =>
      next()
}))

const { default: app } = await import('../src/app.js')
const { setupTestDb, closeTestDb } = await import('./helpers/db.js')

// El origen permitido sale de FRONTEND_URL (ver vitest.config.ts).
const ORIGEN_PERMITIDO = 'http://localhost:5173'
const ORIGEN_MALICIOSO = 'https://sitio-malicioso.com'

/**
 * Defensa CSRF: con la cookie en SameSite=None, CORS solo impide LEER la
 * respuesta — la petición cross-site llega igual y ejecuta con la cookie de la
 * víctima. Por eso el server corta por Origin toda petición que mute estado.
 */
describe('verificación de Origin (anti-CSRF)', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('rechaza con 403 una mutación desde un origen no permitido', async () => {
    const res = await request(app)
      .post('/api/auth/prelogin')
      .set('Origin', ORIGEN_MALICIOSO)
      .send({ username: 'victima' })

    expect(res.status).toBe(403)
  })

  it.each(['PUT', 'DELETE'])('corta también %s desde un origen no permitido', async (metodo) => {
    const res = await request(app)
      [metodo.toLowerCase() as 'put' | 'delete']('/api/auth/master')
      .set('Origin', ORIGEN_MALICIOSO)
      .send({})

    expect(res.status).toBe(403)
  })

  it('deja pasar la mutación desde el origen permitido', async () => {
    const res = await request(app)
      .post('/api/auth/prelogin')
      .set('Origin', ORIGEN_PERMITIDO)
      .send({ username: 'alguien' })

    expect(res.status).toBe(200)
  })

  // Fuera de un navegador no hay cookie ambiental, así que no hay vector CSRF.
  it('deja pasar peticiones sin Origin (curl, apps nativas)', async () => {
    const res = await request(app).post('/api/auth/prelogin').send({ username: 'alguien' })
    expect(res.status).toBe(200)
  })

  it('no bloquea lecturas: el filtro es solo para métodos que mutan', async () => {
    const res = await request(app).get('/api/auth/me').set('Origin', ORIGEN_MALICIOSO)

    // 401 por falta de sesión, NO 403 por origen.
    expect(res.status).toBe(401)
  })
})
