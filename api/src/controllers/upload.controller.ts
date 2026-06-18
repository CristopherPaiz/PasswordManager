import { Request, Response } from 'express'
import { HTTP_STATUS } from '@config/constants.js'
import { sendSuccess } from '@utils/response.helper.js'

export const uploadTestImage = (req: Request, res: Response): void => {
  const imageUrl = req.body.imageUrl
  const imagePublicId = req.body.imagePublicId

  if (!imageUrl || !imagePublicId) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'No se procesó ninguna imagen'
    })
    return
  }

  sendSuccess({
    res,
    status: HTTP_STATUS.CREATED,
    message: 'Imagen subida exitosamente a Cloudinary',
    data: {
      url: imageUrl,
      publicId: imagePublicId
    }
  })
}
