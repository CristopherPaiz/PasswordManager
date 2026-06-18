import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { uploadImageToCloudinary } from '@utils/cloudinary.helper.js'
import { HTTP_STATUS } from '@config/constants.js'

const storage = multer.memoryStorage()

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true)
  } else {
    cb(new Error('Solo se permiten archivos de imagen.'))
  }
}

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter
})

export const handleImageUpload = (
  fieldName: string,
  folder: string,
  transformations: Record<string, unknown>[] = [{ quality: 'auto:good' }]
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    upload.single(fieldName)(req, res, async (err: unknown) => {
      if (err) {
        const isSizeError = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        const errorMessage = err instanceof Error ? err.message : 'Error al procesar la imagen'

        res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: isSizeError ? 'La imagen es demasiado grande (máx 10MB).' : errorMessage
        })
        return
      }

      if (!req.file) {
        return next()
      }

      try {
        const result = await uploadImageToCloudinary(
          req.file.buffer,
          folder,
          'webp',
          transformations
        )

        req.body.imageUrl = result.secure_url
        req.body.imagePublicId = result.public_id

        next()
      } catch (uploadError) {
        res
          .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
          .json({ message: 'Error interno al subir la imagen.' })
      }
    })
  }
}
