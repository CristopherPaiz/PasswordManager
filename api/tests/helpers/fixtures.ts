import crypto from 'node:crypto'
import request from 'supertest'
import type { Application } from 'express'
import { SYSTEM } from '@config/constants.js'

/**
 * Constructores de payloads válidos para los endpoints de auth.
 *
 * OJO con la semántica: `password` NUNCA es la contraseña maestra. Es el
 * authHash (base64) que el navegador deriva de ella. Los tests lo tratan como
 * un opaco: lo que se verifica es que el server lo bcrypt-ea y lo compara, no
 * que sepa de dónde salió.
 */

const b64 = (bytes: number): string => crypto.randomBytes(bytes).toString('base64')

// Blob AES-GCM de mentira: el server nunca lo abre (zero-knowledge), solo lo
// guarda y lo devuelve. Su contenido es irrelevante; su forma no.
export const fakeBlob = (): { iv: string; ct: string } => ({ iv: b64(12), ct: b64(48) })

// Mínimos aceptados por el schema (OWASP): m ≥ 19456 KiB, t ≥ 2.
export const validKdfParams = { algo: 'argon2id', m: 65536, t: 3, p: 1, hashLen: 32 } as const

export interface TestUser {
  username: string
  password: string
  email: string
  kdf_salt: string
  kdf_params: typeof validKdfParams
  wrapped_vault_key: { iv: string; ct: string }
  wrapped_vault_key_recovery: { iv: string; ct: string }
  recovery_auth: string
}

let counter = 0

export const buildUser = (overrides: Partial<TestUser> = {}): TestUser => {
  counter += 1
  return {
    username: `usuario_${counter}`,
    password: b64(32), // authHash: 44 chars, pasa el min(20) del schema
    email: `usuario_${counter}@test.com`,
    kdf_salt: b64(16),
    kdf_params: validKdfParams,
    wrapped_vault_key: fakeBlob(),
    wrapped_vault_key_recovery: fakeBlob(),
    recovery_auth: b64(32),
    ...overrides
  }
}

export const registerUser = async (app: Application, user: TestUser): Promise<void> => {
  const res = await request(app).post('/api/auth/register').send(user)
  if (res.status !== 201) {
    throw new Error(`registerUser falló (${res.status}): ${JSON.stringify(res.body)}`)
  }
}

// Extrae la cookie de sesión de una respuesta (o null si no vino / vino vacía).
export const extractCookie = (setCookie: string[] | undefined): string | null => {
  const raw = setCookie?.find((c) => c.startsWith(`${SYSTEM.COOKIE_NAME}=`))
  if (!raw) return null
  const value = raw.split(';')[0].split('=')[1]
  return value ? raw.split(';')[0] : null
}

// Registra + hace login y devuelve la cookie lista para mandar en `.set('Cookie', ...)`.
export const registerAndLogin = async (
  app: Application,
  overrides: Partial<TestUser> = {}
): Promise<{ user: TestUser; cookie: string }> => {
  const user = buildUser(overrides)
  await registerUser(app, user)

  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.password })

  const cookie = extractCookie(res.headers['set-cookie'] as unknown as string[] | undefined)
  if (!cookie) throw new Error(`login no devolvió cookie: ${JSON.stringify(res.body)}`)

  return { user, cookie }
}
