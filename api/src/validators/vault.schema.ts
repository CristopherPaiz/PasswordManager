import { z } from 'zod'

// El server NUNCA ve el contenido en claro: solo el ciphertext (AES-GCM) y su iv.
// `tipo` queda en claro solo para listar/filtrar sin descifrar.
// `uid`: identificador generado por el CLIENTE que se usa como AAD del cifrado
// GCM; liga cada blob a su fila para que el server no pueda intercambiar
// ciphertexts entre items sin romper el tag de autenticación.
const tipoSchema = z.enum(['password', 'card', 'note'])
const uidSchema = z.string().trim().min(8).max(64)

export const vaultItemSchema = z.object({
  tipo: tipoSchema.default('password'),
  ciphertext: z.string().min(1).max(20000),
  iv: z.string().min(1).max(64),
  uid: uidSchema
})

// Al editar, el tipo es opcional (puede no cambiar). `uid` opcional: los items
// LEGACY (sin uid) lo adquieren en su primera edición (migración perezosa).
export const vaultItemUpdateSchema = z.object({
  tipo: tipoSchema.optional(),
  ciphertext: z.string().min(1).max(20000),
  iv: z.string().min(1).max(64),
  uid: uidSchema.optional()
})

// Import masivo: lista de items cifrados (máx 2000 por seguridad).
export const vaultBulkSchema = z.object({
  items: z.array(vaultItemSchema).min(1).max(2000)
})

// Manifiesto del baúl: inventario cifrado (con la vaultKey) de qué items
// existen y con qué contenido. El server lo guarda opaco; solo valida la forma
// y que la versión avance (monótona), nunca puede leerlo.
export const vaultManifestSchema = z.object({
  manifest: z.object({
    iv: z.string().min(1).max(64),
    ct: z.string().min(1).max(400000)
  }),
  version: z.number().int().min(1)
})
