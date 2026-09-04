import { Router, Request } from 'express'
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
  upgradeKdf,
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
  changeMasterSchema,
  kdfUpgradeSchema
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

// Límite POR CUENTA: el límite por IP se evade rotando IPs. Este se cuenta por
// username, así un atacante distribuido no puede martillar UNA cuenta. No es un
// "lockout" permanente (se reinicia con la ventana) → no permite DoS al dueño.
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Demasiados intentos para esta cuenta. Espera unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  // La clave es el username (no la IP) → protege UNA cuenta de un ataque
  // distribuido. Las peticiones sin username comparten un bucket y de todos
  // modos las rechaza validate() justo después; la IP la cubren los otros límites.
  keyGenerator: (req: Request): string => {
    const raw = (req.body as { username?: unknown })?.username
    const username = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    return username ? `user:${username}` : 'anon:no-username'
  }
})

router.post('/register', authLimiter, validate(registerSchema), register)
router.post('/prelogin', authLimiter, accountLimiter, validate(preloginSchema), prelogin)
router.post('/login', authLimiter, accountLimiter, validate(loginSchema), login)
router.post('/logout', logout)
router.get('/me', authMiddleware, getMe)

// Recuperación de maestra (públicas, autorizadas por la llave de recuperación).
router.post(
  '/recovery/start',
  authLimiter,
  accountLimiter,
  validate(recoveryStartSchema),
  recoveryStart
)
router.post(
  '/recovery/reset',
  authLimiter,
  accountLimiter,
  validate(recoveryResetSchema),
  recoveryReset
)

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
// Endurecer Argon2id sin cambiar la maestra (migración silenciosa al desbloquear).
router.put('/kdf', authMiddleware, validate(kdfUpgradeSchema), upgradeKdf)
router.get('/sessions', authMiddleware, sessionsList)
router.delete('/sessions/:id', authMiddleware, sessionRevoke)

export default router
