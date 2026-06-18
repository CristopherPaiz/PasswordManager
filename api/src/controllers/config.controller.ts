import { Request, Response, NextFunction } from 'express'
import { DatabaseService } from '@database/connection.js'
import { HTTP_STATUS } from '@config/constants.js'

interface ConfigRow {
  Nombre: string
  Valor: string
}

export const getConfigs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const dbClient = await DatabaseService.getInstance().getClient()

    const SP_Configuraciones_ObtenerTodas = 'SELECT Nombre, Valor FROM Configuraciones'

    const { rows } = await dbClient.execute(SP_Configuraciones_ObtenerTodas)

    const configs = rows.reduce((acc: Record<string, string>, row: unknown) => {
      const config = row as ConfigRow
      acc[config.Nombre] = config.Valor
      return acc
    }, {})

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: configs
    })
  } catch (error) {
    next(error)
  }
}
