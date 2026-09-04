import express, { Application } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import { errorMiddleware } from '@middlewares/error.middleware.js'
import { originCheckMiddleware } from '@middlewares/origin.middleware.js'
import { HTTP_STATUS } from '@config/constants.js'
import authRoutes from '@routes/auth.routes.js'
import vaultRoutes from '@routes/vault.routes.js'
import configRoutes from '@routes/config.routes.js'
import systemRoutes from '@routes/system.routes.js'
import errorsRoutes from '@routes/errors.routes.js'

const app: Application = express()

app.set('trust proxy', 1)

app.use(helmet())
app.use(compression())

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Demasiadas peticiones desde esta IP, por favor intente de nuevo más tarde.'
  },
  standardHeaders: true,
  legacyHeaders: false
})

app.use('/api', limiter)

// Acepta orígenes desde FRONTEND_URL y/o CORS_ORIGINS (separados por comas).
// Ejemplo en .env: CORS_ORIGINS=https://app.com,https://admin.app.com,https://staging.app.com
const parseOrigins = (raw?: string): string[] =>
  (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

const allowedOrigins = [
  ...parseOrigins(process.env.FRONTEND_URL),
  ...parseOrigins(process.env.CORS_ORIGINS)
]

const corsOrigins =
  allowedOrigins.length > 0 ? Array.from(new Set(allowedOrigins)) : ['http://localhost:5173']

app.use(
  cors({
    origin: (origin, callback) => {
      // Permite peticiones sin Origin (curl, Postman, apps móviles) y las de la lista.
      // Un Origin desconocido NO lanza error (eso terminaba en 500 y ensuciaba
      // ErrorLogs): se niega el CORS (sin headers, el navegador no puede leer la
      // respuesta) y las mutaciones las corta originCheckMiddleware con 403.
      callback(null, !origin || corsOrigins.includes(origin))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
)

// Anti-CSRF: rechaza mutaciones cuyo Origin no esté en la allowlist (CORS solo
// bloquea leer la respuesta, no que la petición ejecute con la cookie).
app.use('/api', originCheckMiddleware(corsOrigins))

// Límite de cuerpo: acota DoS por payloads gigantes. 10mb cubre import masivo
// realista del baúl (cientos de items cifrados) sin abrir la puerta a abusos.
app.use(express.json({ limit: '10mb' }))
app.use(cookieParser())

app.use('/api/auth', authRoutes)
app.use('/api/vault', vaultRoutes)
app.use('/api/config', configRoutes)
app.use('/api/system', systemRoutes)
app.use('/api/errors', errorsRoutes)

// Mismo handler en varias rutas: si un adblocker (ej. Brave) bloquea /health
// por su nombre, la UI reintenta contra /ping y /status como respaldo.
app.get(['/health', '/ping', '/status'], (req, res) => {
  res.status(HTTP_STATUS.OK).json({ success: true, status: 'ok' })
})

// Ruta de prueba del middleware de errores. Solo fuera de producción: en prod
// sería un endpoint público que ensucia ErrorLogs y ejercita el error path.
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/force-error', (req, res, next) => {
    next(new Error('ESTE ES UN ERROR CRÍTICO SIMULADO PARA PROBAR EL MIDDLEWARE'))
  })
}

// 404 para cualquier ruta no registrada.
app.use((req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  })
})

app.use(errorMiddleware)

export default app
