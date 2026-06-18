import { Request, Response } from 'express'
import { HTTP_STATUS } from '@config/constants.js'
import { sendSuccess } from '@utils/response.helper.js'
import { getServerTimeInfo } from '@utils/datetime.helper.js'

export const getServerTime = (req: Request, res: Response): void => {
  sendSuccess({
    res,
    status: HTTP_STATUS.OK,
    message: 'Hora del servidor',
    data: getServerTimeInfo()
  })
}
