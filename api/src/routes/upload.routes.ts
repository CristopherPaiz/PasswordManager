import { Router } from 'express'
import { uploadTestImage } from '@controllers/upload.controller.js'
import { handleImageUpload } from '@middlewares/upload.middleware.js'
import { authMiddleware } from '@middlewares/auth.middleware.js'

const router = Router()

router.post(
  '/test',
  authMiddleware,
  handleImageUpload('imagen_prueba', 'test_uploads'),
  uploadTestImage
)

export default router
