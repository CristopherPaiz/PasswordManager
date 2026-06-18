import { Router } from 'express'
import { register, login, logout, getMe } from '@controllers/auth.controller.js'
import { authMiddleware } from '@middlewares/auth.middleware.js'
import { validate } from '@middlewares/validate.middleware.js'
import { registerSchema, loginSchema } from '@validators/auth.schema.js'

const router = Router()

router.post('/register', validate(registerSchema), register)
router.post('/login', validate(loginSchema), login)
router.post('/logout', logout)
router.get('/me', authMiddleware, getMe)

export default router
