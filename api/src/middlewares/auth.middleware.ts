import { Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AuthenticatedRequest, JwtPayload } from '@apptypes/index.js'
import { HTTP_STATUS, MESSAGES, SYSTEM } from '@config/constants.js'
import { DatabaseService } from '@database/connection.js'

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = req.cookies[SYSTEM.COOKIE_NAME]

  if (!token) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.AUTH.UNAUTHORIZED })
    return
  }

  const secretKey = process.env.JWT_SECRET_KEY

  if (!secretKey) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: MESSAGES.SERVER.ERROR })
    return
  }

  try {
    const decoded = jwt.verify(token, secretKey) as JwtPayload

    // Verifica que la sesión siga activa en BD: así el logout (activa = 0)
    // invalida el token de verdad, no solo borra la cookie del cliente.
    const dbClient = await DatabaseService.getInstance().getClient()
    const nowIso = new Date().toISOString()

    const { rows: sessions } = await dbClient.execute({
      sql: 'SELECT id FROM Sesiones WHERE token = ? AND activa = 1 AND fecha_expiracion > ?',
      args: [token, nowIso]
    })

    if (sessions.length === 0) {
      res.clearCookie(SYSTEM.COOKIE_NAME)
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.AUTH.TOKEN_EXPIRED })
      return
    }

    req.user = decoded
    next()
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.clearCookie(SYSTEM.COOKIE_NAME)
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.AUTH.TOKEN_EXPIRED })
      return
    }
    res.status(HTTP_STATUS.FORBIDDEN).json({ message: MESSAGES.AUTH.INVALID_TOKEN })
  }
}
