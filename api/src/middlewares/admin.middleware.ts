import { Response, NextFunction } from 'express'
import { AuthenticatedRequest } from '@apptypes/index.js'
import { HTTP_STATUS, MESSAGES } from '@config/constants.js'
import { DatabaseService } from '@database/connection.js'

// Restringe el acceso a usuarios con rol 'admin'. Debe ir DESPUÉS de authMiddleware
// (necesita req.user.userId). Verifica el rol contra la BD, no contra el JWT, para
// que un cambio de rol surta efecto sin re-emitir el token.
export const adminMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId

    if (!userId) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.AUTH.UNAUTHORIZED })
      return
    }

    const dbClient = await DatabaseService.getInstance().getClient()
    const { rows } = await dbClient.execute({
      sql: 'SELECT rol FROM Usuarios WHERE id = ? AND activo = 1',
      args: [userId]
    })

    if (rows.length === 0 || String(rows[0].rol) !== 'admin') {
      res.status(HTTP_STATUS.FORBIDDEN).json({ message: MESSAGES.AUTH.FORBIDDEN })
      return
    }

    next()
  } catch (error) {
    next(error)
  }
}
