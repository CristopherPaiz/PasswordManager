import { z } from 'zod'

// El server NUNCA ve el contenido en claro: solo el ciphertext (AES-GCM) y su iv.
// `tipo` queda en claro solo para listar/filtrar sin descifrar.
export const vaultItemSchema = z.object({
  tipo: z.string().trim().min(1).max(30).default('password'),
  ciphertext: z.string().min(1).max(20000),
  iv: z.string().min(1).max(64)
})

// Al editar, el tipo es opcional (puede no cambiar).
export const vaultItemUpdateSchema = z.object({
  tipo: z.string().trim().min(1).max(30).optional(),
  ciphertext: z.string().min(1).max(20000),
  iv: z.string().min(1).max(64)
})

// Import masivo: lista de items cifrados (máx 2000 por seguridad).
export const vaultBulkSchema = z.object({
  items: z.array(vaultItemSchema).min(1).max(2000)
})
