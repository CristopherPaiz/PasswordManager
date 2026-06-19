import { Router } from 'express'
import {
  register,
  login,
  logout,
  getMe,
  prelogin,
  recoveryStart,
  recoveryReset,
  totpSetup,
  totpEnable,
  totpDisable,
  passkeyRegister,
  passkeyDelete
} from '@controllers/auth.controller.js'
import { authMiddleware } from '@middlewares/auth.middleware.js'
import { validate } from '@middlewares/validate.middleware.js'
import {
  registerSchema,
  loginSchema,
  preloginSchema,
  recoveryStartSchema,
  recoveryResetSchema,
  totpTokenSchema,
  passkeyRegisterSchema
} from '@validators/auth.schema.js'

const router = Router()

router.post('/register', validate(registerSchema), register)
router.post('/prelogin', validate(preloginSchema), prelogin)
router.post('/login', validate(loginSchema), login)
router.post('/logout', logout)
router.get('/me', authMiddleware, getMe)

// Recuperación de maestra (públicas, autorizadas por la llave de recuperación).
router.post('/recovery/start', validate(recoveryStartSchema), recoveryStart)
router.post('/recovery/reset', validate(recoveryResetSchema), recoveryReset)

// TOTP 2FA (requieren sesión válida).
router.post('/totp/setup', authMiddleware, totpSetup)
router.post('/totp/enable', authMiddleware, validate(totpTokenSchema), totpEnable)
router.post('/totp/disable', authMiddleware, validate(totpTokenSchema), totpDisable)

// Passkey / huella (requieren sesión válida).
router.post('/passkey', authMiddleware, validate(passkeyRegisterSchema), passkeyRegister)
router.delete('/passkey', authMiddleware, passkeyDelete)

export default router
