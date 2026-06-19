import { Router } from 'express'
import rateLimit from 'express-rate-limit'
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
  passkeyList,
  passkeyDelete,
  changeMaster,
  sessionsList,
  sessionRevoke
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
  passkeyRegisterSchema,
  changeMasterSchema
} from '@validators/auth.schema.js'

const router = Router()

// Límite estricto para endpoints sensibles a fuerza bruta (login, recuperación,
// registro). Más ajustado que el límite global de /api. Por IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
  standardHeaders: true,
  legacyHeaders: false
})

router.post('/register', authLimiter, validate(registerSchema), register)
router.post('/prelogin', authLimiter, validate(preloginSchema), prelogin)
router.post('/login', authLimiter, validate(loginSchema), login)
router.post('/logout', logout)
router.get('/me', authMiddleware, getMe)

// Recuperación de maestra (públicas, autorizadas por la llave de recuperación).
router.post('/recovery/start', authLimiter, validate(recoveryStartSchema), recoveryStart)
router.post('/recovery/reset', authLimiter, validate(recoveryResetSchema), recoveryReset)

// TOTP 2FA (requieren sesión válida).
router.post('/totp/setup', authMiddleware, totpSetup)
router.post('/totp/enable', authMiddleware, validate(totpTokenSchema), totpEnable)
router.post('/totp/disable', authMiddleware, validate(totpTokenSchema), totpDisable)

// Passkey / huella (requieren sesión válida). Una por dispositivo.
router.get('/passkeys', authMiddleware, passkeyList)
router.post('/passkey', authMiddleware, validate(passkeyRegisterSchema), passkeyRegister)
router.delete('/passkey/:id', authMiddleware, passkeyDelete)

// Cambio de maestra y gestión de sesiones (requieren sesión válida).
router.put('/master', authMiddleware, validate(changeMasterSchema), changeMaster)
router.get('/sessions', authMiddleware, sessionsList)
router.delete('/sessions/:id', authMiddleware, sessionRevoke)

export default router
