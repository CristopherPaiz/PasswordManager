import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { HTTP_STATUS } from '@config/constants.js'

// Middleware genérico: valida req.body contra un esquema de Zod.
// Si pasa, reemplaza req.body por los datos ya parseados/saneados.
export const validate =
  (schema: z.ZodType) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message
      }))

      res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Datos de entrada inválidos.',
        errors
      })
      return
    }

    req.body = result.data
    next()
  }
