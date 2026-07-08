import { Request, Response, NextFunction } from 'express'
import { HTTP_STATUS } from '@config/constants.js'

// Defensa CSRF por verificación de Origin. Con la cookie en SameSite=None
// (front y API en dominios distintos), CORS solo impide LEER la respuesta;
// la petición cross-site llega igual y ejecuta con la cookie de la víctima.
// Este middleware corta cualquier método que mute estado si el Origin no está
// en la lista permitida. Peticiones SIN Origin (curl, apps nativas) pasan:
// fuera de un navegador no existe el vector CSRF (no hay cookie ambiental).
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export const originCheckMiddleware =
  (allowedOrigins: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!MUTATING_METHODS.has(req.method)) {
      next()
      return
    }

    const origin = req.headers.origin
    if (!origin || allowedOrigins.includes(origin)) {
      next()
      return
    }

    res.status(HTTP_STATUS.FORBIDDEN).json({ message: 'Origen no permitido.' })
  }
