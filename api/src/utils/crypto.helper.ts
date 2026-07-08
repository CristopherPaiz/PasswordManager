import crypto from 'node:crypto'

// Cifra secretos del lado servidor (ej. el secreto TOTP) para que una filtración
// de la BD no los exponga en claro. Llave derivada de env (TOTP_ENC_KEY o, en su
// defecto, JWT_SECRET_KEY) con SHA-256 → 32 bytes para AES-256-GCM.
//
// Formato: "ivB64:ctB64:tagB64". Si el valor guardado NO tiene ese formato
// (sin ':'), se asume LEGACY en texto plano y se devuelve tal cual — así no se
// rompen secretos creados antes de habilitar el cifrado (base32 no usa ':').

const getKey = (): Buffer => {
  // Preferir una llave dedicada (TOTP_ENC_KEY); si no existe, caer a JWT_SECRET_KEY
  // (siempre presente: lo valida env.validator). NO hay fallback a literal inseguro.
  const material = process.env.TOTP_ENC_KEY ?? process.env.JWT_SECRET_KEY
  if (!material) throw new Error('Falta TOTP_ENC_KEY/JWT_SECRET_KEY para cifrar secretos.')
  return crypto.createHash('sha256').update(String(material)).digest()
}

// Hash de un token de sesión para guardarlo en BD. Así una filtración de la BD
// NO expone JWTs usables: comparamos el hash, no el token en claro.
export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex')

// Bytes deterministas por (label, input) vía HMAC-SHA256 expandido por contador.
// Sirven para fabricar respuestas señuelo estables (salt/blob falsos) cuando un
// usuario NO existe: el atacante recibe siempre lo mismo para ese username y no
// puede distinguir cuentas reales de inexistentes (anti-enumeración).
export const deterministicBytes = (label: string, input: string, length: number): Buffer => {
  const key = String(process.env.JWT_SECRET_KEY ?? '')
  const blocks: Buffer[] = []
  let total = 0
  for (let i = 0; total < length; i++) {
    const block = crypto.createHmac('sha256', key).update(`${label}:${i}:${input}`).digest()
    blocks.push(block)
    total += block.length
  }
  return Buffer.concat(blocks).subarray(0, length)
}

// ¿El valor guardado ya está cifrado con el formato "iv:ct:tag"? Los secretos
// LEGACY en texto plano (base32, sin ':') devuelven false y deben re-cifrarse.
export const isEncryptedSecret = (stored: string): boolean => stored.split(':').length === 3

export const encryptSecret = (plain: string): string => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`
}

export const decryptSecret = (stored: string): string => {
  const parts = stored.split(':')
  if (parts.length !== 3) return stored // LEGACY en texto plano
  const [ivB64, ctB64, tagB64] = parts
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()])
  return pt.toString('utf8')
}
