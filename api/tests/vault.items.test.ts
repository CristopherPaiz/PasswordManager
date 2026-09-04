import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import crypto from 'node:crypto'
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

/**
 * Item cifrado tal como lo manda el navegador. El contenido es opaco para el
 * server: aquí basta con bytes aleatorios con la forma correcta.
 *
 * `uid` lo genera el CLIENTE y se usa como AAD del GCM, así que el server debe
 * conservarlo intacto: si lo pisara, el blob dejaría de descifrar.
 */
const buildItem = (
  overrides: Partial<{ tipo: string; ciphertext: string; iv: string; uid: string }> = {}
): { tipo: string; ciphertext: string; iv: string; uid: string } => ({
  tipo: 'password',
  ciphertext: crypto.randomBytes(64).toString('base64'),
  iv: crypto.randomBytes(12).toString('base64'),
  uid: crypto.randomUUID(),
  ...overrides
})

const crearItem = async (
  cookie: string,
  overrides: Parameters<typeof buildItem>[0] = {}
): Promise<{ id: number; item: ReturnType<typeof buildItem> }> => {
  const item = buildItem(overrides)
  const res = await request(app).post('/api/vault').set('Cookie', cookie).send(item)
  if (res.status !== 201) throw new Error(`crearItem falló: ${JSON.stringify(res.body)}`)
  return { id: Number(res.body.id), item }
}

describe('baúl: alta, listado, edición y borrado', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('guarda el item cifrado tal cual llegó', async () => {
    const { cookie } = await registerAndLogin(app)
    const { id, item } = await crearItem(cookie)

    const { rows } = await getTestDb().execute({
      sql: 'SELECT * FROM VaultItems WHERE id = ?',
      args: [id]
    })

    expect(rows).toHaveLength(1)
    expect(String(rows[0].ciphertext)).toBe(item.ciphertext)
    expect(String(rows[0].iv)).toBe(item.iv)
    expect(String(rows[0].uid)).toBe(item.uid)
    expect(String(rows[0].tipo)).toBe('password')
  })

  it('el listado devuelve solo los items del dueño', async () => {
    const primero = await registerAndLogin(app)
    const segundo = await registerAndLogin(app)

    await crearItem(primero.cookie)
    await crearItem(primero.cookie)
    const ajeno = await crearItem(segundo.cookie)

    const res = await request(app).get('/api/vault').set('Cookie', primero.cookie)

    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(2)
    expect(res.body.items.map((i: { id: number }) => i.id)).not.toContain(ajeno.id)
  })

  it('el listado no filtra el usuario_id de las filas', async () => {
    const { cookie } = await registerAndLogin(app)
    await crearItem(cookie)

    const res = await request(app).get('/api/vault').set('Cookie', cookie)

    expect(res.body.items[0].usuario_id).toBeUndefined()
  })

  it('acepta los tres tipos de item', async () => {
    const { cookie } = await registerAndLogin(app)

    for (const tipo of ['password', 'card', 'note']) {
      const { id } = await crearItem(cookie, { tipo })
      const { rows } = await getTestDb().execute({
        sql: 'SELECT tipo FROM VaultItems WHERE id = ?',
        args: [id]
      })
      expect(String(rows[0].tipo)).toBe(tipo)
    }
  })

  it('edita el blob y actualiza la fecha de modificación', async () => {
    const { cookie } = await registerAndLogin(app)
    const { id } = await crearItem(cookie)
    const nuevo = buildItem()

    const res = await request(app)
      .put(`/api/vault/${id}`)
      .set('Cookie', cookie)
      .send({ ciphertext: nuevo.ciphertext, iv: nuevo.iv, tipo: 'note' })

    expect(res.status).toBe(200)

    const { rows } = await getTestDb().execute({
      sql: 'SELECT * FROM VaultItems WHERE id = ?',
      args: [id]
    })
    expect(String(rows[0].ciphertext)).toBe(nuevo.ciphertext)
    expect(String(rows[0].iv)).toBe(nuevo.iv)
    expect(String(rows[0].tipo)).toBe('note')
  })

  // El `uid` es el AAD del GCM: pisarlo dejaría el blob imposible de descifrar.
  it('nunca sobrescribe un uid ya asignado', async () => {
    const { cookie } = await registerAndLogin(app)
    const { id, item } = await crearItem(cookie)
    const nuevo = buildItem()

    await request(app)
      .put(`/api/vault/${id}`)
      .set('Cookie', cookie)
      .send({ ciphertext: nuevo.ciphertext, iv: nuevo.iv, uid: nuevo.uid })

    const { rows } = await getTestDb().execute({
      sql: 'SELECT uid FROM VaultItems WHERE id = ?',
      args: [id]
    })
    expect(String(rows[0].uid)).toBe(item.uid)
  })

  // Migración perezosa: los items creados antes del AAD tienen uid NULL y lo
  // adquieren en su primera edición.
  it('un item legacy sin uid adquiere el uid al editarse', async () => {
    const { cookie } = await registerAndLogin(app)
    const { rows: userRows } = await getTestDb().execute('SELECT id FROM Usuarios')
    const legacy = buildItem()

    const insert = await getTestDb().execute({
      sql: 'INSERT INTO VaultItems (usuario_id, tipo, ciphertext, iv, uid) VALUES (?, ?, ?, ?, NULL)',
      args: [Number(userRows[0].id), 'password', legacy.ciphertext, legacy.iv]
    })
    const id = Number(insert.lastInsertRowid)

    const nuevo = buildItem()
    const res = await request(app)
      .put(`/api/vault/${id}`)
      .set('Cookie', cookie)
      .send({ ciphertext: nuevo.ciphertext, iv: nuevo.iv, uid: nuevo.uid })

    expect(res.status).toBe(200)
    const { rows } = await getTestDb().execute({
      sql: 'SELECT uid FROM VaultItems WHERE id = ?',
      args: [id]
    })
    expect(String(rows[0].uid)).toBe(nuevo.uid)
  })

  it('borra un item propio', async () => {
    const { cookie } = await registerAndLogin(app)
    const { id } = await crearItem(cookie)

    const res = await request(app).delete(`/api/vault/${id}`).set('Cookie', cookie)

    expect(res.status).toBe(200)
    const { rows } = await getTestDb().execute('SELECT COUNT(*) as c FROM VaultItems')
    expect(Number(rows[0].c)).toBe(0)
  })

  it('responde 404 al editar o borrar un id inexistente', async () => {
    const { cookie } = await registerAndLogin(app)

    const put = await request(app)
      .put('/api/vault/99999')
      .set('Cookie', cookie)
      .send({ ciphertext: 'x', iv: 'y' })
    expect(put.status).toBe(404)

    const del = await request(app).delete('/api/vault/99999').set('Cookie', cookie)
    expect(del.status).toBe(404)
  })
})

/**
 * Aislamiento entre usuarios: es LA propiedad del baúl. Cada consulta filtra por
 * `usuario_id`, y estos tests fallan si alguien quita ese `AND` de un WHERE.
 */
describe('baúl: aislamiento entre usuarios', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('no se puede leer el item de otro (no aparece en el listado)', async () => {
    const victima = await registerAndLogin(app)
    const atacante = await registerAndLogin(app)
    const { item } = await crearItem(victima.cookie)

    const res = await request(app).get('/api/vault').set('Cookie', atacante.cookie)

    expect(res.body.items).toHaveLength(0)
    expect(JSON.stringify(res.body)).not.toContain(item.ciphertext)
  })

  it('no se puede editar el item de otro', async () => {
    const victima = await registerAndLogin(app)
    const atacante = await registerAndLogin(app)
    const { id, item } = await crearItem(victima.cookie)
    const intruso = buildItem()

    const res = await request(app)
      .put(`/api/vault/${id}`)
      .set('Cookie', atacante.cookie)
      .send({ ciphertext: intruso.ciphertext, iv: intruso.iv })

    expect(res.status).toBe(404)
    const { rows } = await getTestDb().execute({
      sql: 'SELECT ciphertext FROM VaultItems WHERE id = ?',
      args: [id]
    })
    expect(String(rows[0].ciphertext)).toBe(item.ciphertext)
  })

  it('no se puede borrar el item de otro', async () => {
    const victima = await registerAndLogin(app)
    const atacante = await registerAndLogin(app)
    const { id } = await crearItem(victima.cookie)

    const res = await request(app).delete(`/api/vault/${id}`).set('Cookie', atacante.cookie)

    expect(res.status).toBe(404)
    const { rows } = await getTestDb().execute('SELECT COUNT(*) as c FROM VaultItems')
    expect(Number(rows[0].c)).toBe(1)
  })

  it('todo el baúl exige sesión', async () => {
    expect((await request(app).get('/api/vault')).status).toBe(401)
    expect((await request(app).get('/api/vault/keys')).status).toBe(401)
    expect((await request(app).post('/api/vault').send(buildItem())).status).toBe(401)
    expect(
      (
        await request(app)
          .post('/api/vault/bulk')
          .send({ items: [buildItem()] })
      ).status
    ).toBe(401)
    expect((await request(app).put('/api/vault/1').send({ ciphertext: 'x', iv: 'y' })).status).toBe(
      401
    )
    expect((await request(app).delete('/api/vault/1')).status).toBe(401)
  })
})

describe('POST /api/vault/bulk (import masivo)', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it('inserta todos los items y los asigna al usuario de la sesión', async () => {
    const { cookie } = await registerAndLogin(app)
    const items = [buildItem(), buildItem({ tipo: 'note' }), buildItem({ tipo: 'card' })]

    const res = await request(app).post('/api/vault/bulk').set('Cookie', cookie).send({ items })

    expect(res.status).toBe(201)
    expect(res.body.count).toBe(3)

    const lista = await request(app).get('/api/vault').set('Cookie', cookie)
    expect(lista.body.items).toHaveLength(3)
  })

  it('rechaza una lista vacía', async () => {
    const { cookie } = await registerAndLogin(app)

    const res = await request(app).post('/api/vault/bulk').set('Cookie', cookie).send({ items: [] })

    expect(res.status).toBe(400)
  })

  // Tope de 2000: un import gigante no debe poder tumbar la BD de un golpe.
  it('rechaza un import por encima del tope', async () => {
    const { cookie } = await registerAndLogin(app)
    const items = Array.from({ length: 2001 }, () => buildItem())

    const res = await request(app).post('/api/vault/bulk').set('Cookie', cookie).send({ items })

    expect(res.status).toBe(400)
    const { rows } = await getTestDb().execute('SELECT COUNT(*) as c FROM VaultItems')
    expect(Number(rows[0].c)).toBe(0)
  })

  it('es todo o nada: un item inválido aborta el lote', async () => {
    const { cookie } = await registerAndLogin(app)
    const items = [buildItem(), { ...buildItem(), ciphertext: '' }, buildItem()]

    const res = await request(app).post('/api/vault/bulk').set('Cookie', cookie).send({ items })

    expect(res.status).toBe(400)
    const { rows } = await getTestDb().execute('SELECT COUNT(*) as c FROM VaultItems')
    expect(Number(rows[0].c)).toBe(0)
  })
})

describe('validación de payloads del baúl', () => {
  beforeAll(async () => {
    await setupTestDb()
  })
  beforeEach(async () => {
    await resetTestDb()
  })
  afterAll(() => {
    closeTestDb()
  })

  it.each([
    ['sin ciphertext', { ciphertext: undefined }],
    ['sin iv', { iv: undefined }],
    ['sin uid', { uid: undefined }],
    ['uid demasiado corto', { uid: 'corto' }],
    ['tipo no soportado', { tipo: 'secreto-nuclear' }],
    ['ciphertext por encima del tope', { ciphertext: 'a'.repeat(20001) }]
  ])('rechaza el alta %s', async (_caso, override) => {
    const { cookie } = await registerAndLogin(app)
    const item: Record<string, unknown> = { ...buildItem(), ...override }
    for (const [clave, valor] of Object.entries(override)) {
      if (valor === undefined) delete item[clave]
    }

    const res = await request(app).post('/api/vault').set('Cookie', cookie).send(item)

    expect(res.status).toBe(400)
    const { rows } = await getTestDb().execute('SELECT COUNT(*) as c FROM VaultItems')
    expect(Number(rows[0].c)).toBe(0)
  })

  it('el tipo por defecto es "password"', async () => {
    const { cookie } = await registerAndLogin(app)
    const { ciphertext, iv, uid } = buildItem()

    const res = await request(app)
      .post('/api/vault')
      .set('Cookie', cookie)
      .send({ ciphertext, iv, uid })

    expect(res.status).toBe(201)
    const { rows } = await getTestDb().execute('SELECT tipo FROM VaultItems')
    expect(String(rows[0].tipo)).toBe('password')
  })
})
