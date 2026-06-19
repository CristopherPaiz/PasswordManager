import { Request, Response, NextFunction } from 'express'
import { DatabaseService } from '@database/connection.js'
import { HTTP_STATUS } from '@config/constants.js'
import { formatGuatemala, sqliteUtcToDate } from '@utils/datetime.helper.js'

interface ErrorLogRow {
  id: number
  endpoint: string
  method: string
  error_message: string
  stack_trace: string | null
  resuelto: number
  fecha_creacion: string
}

// Lista paginada de ErrorLogs. Responde { data, pagination } para usePaginatedQuery.
export const getErrorLogs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)
    const limitRaw = parseInt(String(req.query.limit ?? '10'), 10) || 10
    const limit = Math.min(100, Math.max(1, limitRaw))
    const offset = (page - 1) * limit

    const db = await DatabaseService.getInstance().getClient()

    const { rows: countRows } = await db.execute('SELECT COUNT(*) as count FROM ErrorLogs')
    const total = Number(countRows[0].count)

    const { rows } = await db.execute({
      sql: 'SELECT id, endpoint, method, error_message, stack_trace, resuelto, fecha_creacion FROM ErrorLogs ORDER BY id DESC LIMIT ? OFFSET ?',
      args: [limit, offset]
    })

    // fecha_creacion viene en UTC; agregamos fecha_guatemala (GMT-6) ya calculada.
    const data = (rows as unknown as ErrorLogRow[]).map((row) => ({
      id: row.id,
      endpoint: row.endpoint,
      method: row.method,
      error_message: row.error_message,
      stack_trace: row.stack_trace,
      resuelto: row.resuelto,
      fecha_creacion: row.fecha_creacion,
      fecha_guatemala: formatGuatemala(sqliteUtcToDate(row.fecha_creacion))
    }))

    res.status(HTTP_STATUS.OK).json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    next(error)
  }
}
