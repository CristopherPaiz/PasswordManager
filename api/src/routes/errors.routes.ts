import { Router } from 'express'
import { getErrorLogs } from '@controllers/errors.controller.js'
import { authMiddleware } from '@middlewares/auth.middleware.js'
import { adminMiddleware } from '@middlewares/admin.middleware.js'

const router = Router()

// Los stack traces filtran rutas internas, SQL y fragmentos de request: solo admin.
router.get('/', authMiddleware, adminMiddleware, getErrorLogs)

export default router
