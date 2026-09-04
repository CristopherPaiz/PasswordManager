import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Test } from 'supertest'

// Este archivo NO mockea express-rate-limit: el límite ES lo que se prueba.
// Corre en su propio proceso (pool: "forks"), así que arranca con los contadores
// en cero y no contamina a los demás archivos.
const { default: app } = await import('../src/app.js')
const { setupTestDb, closeTestDb } = await import('./helpers/db.js')

// Límites configurados en auth.routes.ts. El presupuesto TOTAL del archivo son
// las 20 peticiones por IP del authLimiter: por eso la cuenta se agota una sola
// vez en el beforeAll y cada test gasta una única petición. Si un test empezara
// a dar 429 por la IP en vez de por la cuenta, el test dejaría de probar lo suyo.
const MAX_POR_CUENTA = 10

const CUENTA_ATACADA = 'cuenta_atacada'

const prelogin = (username: string): Test =>
  request(app).post('/api/auth/prelogin').send({ username })

/**
 * El límite por IP se evade rotando IPs; este va por username, así que un ataque
 * distribuido no puede martillar UNA cuenta. Se ejercita con `prelogin` porque
 * comparte bucket con `login` y no gasta bcrypt.
 */
describe('límite de intentos por cuenta', () => {
  beforeAll(async () => {
    await setupTestDb()

    for (let i = 0; i < MAX_POR_CUENTA; i++) {
      const res = await prelogin(CUENTA_ATACADA)
      expect(res.status).toBe(200)
    }
  })
  afterAll(() => {
    closeTestDb()
  })

  it('bloquea con 429 tras agotar los intentos de un username', async () => {
    const res = await prelogin(CUENTA_ATACADA)
    expect(res.status).toBe(429)
  })

  // El límite por cuenta no puede convertirse en un DoS contra otros usuarios:
  // es una ventana deslizante por username, no un bloqueo permanente.
  it('bloquear una cuenta no bloquea a las demás', async () => {
    const res = await prelogin('cuenta_vecina')
    expect(res.status).toBe(200)
  })

  // Sin bucket compartido, un atacante gastaría 10 intentos en prelogin y otros
  // 10 en login contra la misma cuenta.
  it('prelogin y login comparten el bucket del mismo username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: CUENTA_ATACADA, password: 'authHash-cualquiera' })

    expect(res.status).toBe(429)
  })
})
