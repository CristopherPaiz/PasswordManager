import { Request, Response, NextFunction } from 'express'
import { HTTP_STATUS, MESSAGES, SYSTEM } from '@config/constants.js'
import { DatabaseService } from '@database/connection.js'

export const errorMiddleware = async (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  let errorId: number | null = null

  try {
    const dbClient = await DatabaseService.getInstance().getClient()
    const endpoint = req.originalUrl
    const method = req.method
    const errorMessage = err.message
    const stackTrace = err.stack ?? ''

    const result = await dbClient.execute({
      sql: 'INSERT INTO ErrorLogs (endpoint, method, error_message, stack_trace) VALUES (?, ?, ?, ?)',
      args: [endpoint, method, errorMessage, stackTrace]
    })

    errorId = Number(result.lastInsertRowid)
  } catch (dbError) {
    console.error('Error crítico: No se pudo registrar el error en BD', dbError)
  }

  const isProduction = process.env.NODE_ENV === SYSTEM.ENV_PRODUCTION

  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    message: isProduction ? MESSAGES.SERVER.ERROR : err.message,
    errorId
  })
}
