import { Router } from 'express'
import { getErrorLogs } from '@controllers/errors.controller.js'
import { authMiddleware } from '@middlewares/auth.middleware.js'

const router = Router()

router.get('/', authMiddleware, getErrorLogs)

export default router
