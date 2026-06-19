import express, { Application } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import { errorMiddleware } from '@middlewares/error.middleware.js'
import { HTTP_STATUS } from '@config/constants.js'
import authRoutes from '@routes/auth.routes.js'
import vaultRoutes from '@routes/vault.routes.js'
import uploadRoutes from '@routes/upload.routes.js'
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
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error(`Origen no permitido por CORS: ${origin}`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
)

app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authRoutes)
app.use('/api/vault', vaultRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/config', configRoutes)
app.use('/api/system', systemRoutes)
app.use('/api/errors', errorsRoutes)

// Mismo handler en varias rutas: si un adblocker (ej. Brave) bloquea /health
// por su nombre, la UI reintenta contra /ping y /status como respaldo.
app.get(['/health', '/ping', '/status'], (req, res) => {
  res.status(HTTP_STATUS.OK).json({ success: true, status: 'ok' })
})

app.get('/api/force-error', (req, res, next) => {
  next(new Error('ESTE ES UN ERROR CRÍTICO SIMULADO PARA PROBAR EL MIDDLEWARE'))
})

// 404 para cualquier ruta no registrada.
app.use((req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  })
})

app.use(errorMiddleware)

export default app
