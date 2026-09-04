import { z } from 'zod'

// Blob cifrado AES-GCM: nonce (iv) + texto cifrado (ct), ambos en base64.
const encryptedBlobSchema = z.object({
  iv: z.string().min(1).max(64),
  ct: z.string().min(1).max(20000)
})

// Parámetros del KDF (Argon2id) para re-derivar la llave maestra en el cliente.
// IMPORTANTE: el server impone un PISO mínimo. Toda la seguridad zero-knowledge
// descansa en la fuerza del KDF; si la BD se filtra, params débiles harían el
// vault rompible por fuerza bruta. Un cliente manipulado NO puede registrar con
// Argon2 trivial (m=1, t=1). Mínimos alineados con OWASP (19 MiB / 2 pasadas).
const kdfParamsSchema = z.object({
  algo: z.literal('argon2id'),
  m: z.number().int().min(19456, 'Parámetros KDF inseguros.'), // memoria (KiB) ≥ ~19 MiB
  t: z.number().int().min(2, 'Parámetros KDF inseguros.'), // iteraciones ≥ 2
  p: z.number().int().min(1).max(4), // paralelismo
  hashLen: z.literal(32) // 32 bytes → AES-256
})

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'El usuario debe tener al menos 3 caracteres.')
    .max(30, 'El usuario no puede exceder 30 caracteres.')
    .regex(/^[a-z0-9_]+$/i, 'Solo se permiten letras, números y guion bajo.')
    .transform((value) => value.toLowerCase()),
  // OJO: NO es la contraseña maestra. Es el authHash derivado en el navegador
  // (base64). La maestra nunca viaja al servidor.
  password: z.string().min(20, 'Credencial inválida.').max(200, 'Credencial inválida.'),
  email: z.email('El correo no es válido.'),
  nombre: z.string().trim().max(50).optional(),
  apellido: z.string().trim().max(50).optional(),
  kdf_salt: z.string().min(1).max(128),
  kdf_params: kdfParamsSchema,
  wrapped_vault_key: encryptedBlobSchema,
  wrapped_vault_key_recovery: encryptedBlobSchema,
  // Hash de la llave de recuperación: autoriza un reset de maestra a futuro.
  recovery_auth: z.string().min(1).max(200)
})

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'El usuario es obligatorio.')
    .transform((value) => value.toLowerCase()),
  // authHash derivado en el navegador, base64.
  password: z.string().min(1, 'La contraseña es obligatoria.'),
  // Código TOTP de 6 dígitos (solo si el usuario tiene 2FA activo).
  token: z
    .string()
    .regex(/^\d{6}$/, 'El código debe tener 6 dígitos.')
    .optional()
})

// Pre-login: el cliente necesita salt + params ANTES de poder derivar el authHash.
// Devolver el salt no es secreto (los salts no lo son).
export const preloginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'El usuario es obligatorio.')
    .transform((value) => value.toLowerCase())
})

// Recuperación: inicia el flujo entregando el blob de recovery.
export const recoveryStartSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'El usuario es obligatorio.')
    .transform((value) => value.toLowerCase())
})

// Recuperación: aplica una maestra nueva, autorizada por recovery_auth.
// La llave usada se rota: el cliente manda el blob y hash de una llave NUEVA.
export const recoveryResetSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'El usuario es obligatorio.')
    .transform((value) => value.toLowerCase()),
  recovery_auth: z.string().min(1).max(200),
  password: z.string().min(20, 'Credencial inválida.').max(200, 'Credencial inválida.'),
  kdf_salt: z.string().min(1).max(128),
  kdf_params: kdfParamsSchema,
  wrapped_vault_key: encryptedBlobSchema,
  wrapped_vault_key_recovery: encryptedBlobSchema,
  new_recovery_auth: z.string().min(1).max(200)
})

// TOTP: solo un código de 6 dígitos.
export const totpTokenSchema = z.object({
  token: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos.')
})

// Passkey: id de credencial (base64) + vaultKey envuelta por el secreto PRF +
// etiqueta legible del dispositivo.
export const passkeyRegisterSchema = z.object({
  cred_id: z.string().min(1).max(1000),
  wrapped_vault_key: encryptedBlobSchema,
  label: z.string().trim().max(80).optional()
})

// Cambio de maestra estando dentro: verifica la actual y aplica la nueva.
// Endurecimiento del KDF: misma maestra, parámetros nuevos. Forma idéntica a
// changeMaster (el server no distingue una de otra: en ambas recibe un authHash
// nuevo), pero se separa para no arrastrar el cierre de sesiones.
export const kdfUpgradeSchema = z.object({
  current_password: z.string().min(1).max(200),
  password: z.string().min(20, 'Credencial inválida.').max(200, 'Credencial inválida.'),
  kdf_salt: z.string().min(1).max(128),
  kdf_params: kdfParamsSchema,
  wrapped_vault_key: encryptedBlobSchema
})

export const changeMasterSchema = z.object({
  current_password: z.string().min(1).max(200),
  password: z.string().min(20, 'Credencial inválida.').max(200, 'Credencial inválida.'),
  kdf_salt: z.string().min(1).max(128),
  kdf_params: kdfParamsSchema,
  wrapped_vault_key: encryptedBlobSchema
})
