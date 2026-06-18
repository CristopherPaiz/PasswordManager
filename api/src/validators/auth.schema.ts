import { z } from 'zod'

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'El usuario debe tener al menos 3 caracteres.')
    .max(30, 'El usuario no puede exceder 30 caracteres.')
    .regex(/^[a-z0-9_]+$/i, 'Solo se permiten letras, números y guion bajo.')
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres.')
    .max(100, 'La contraseña no puede exceder 100 caracteres.'),
  email: z.email('El correo no es válido.'),
  nombre: z.string().trim().max(50).optional(),
  apellido: z.string().trim().max(50).optional()
})

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'El usuario es obligatorio.')
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, 'La contraseña es obligatoria.')
})
