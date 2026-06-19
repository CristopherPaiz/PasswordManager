import dotenv from 'dotenv'
dotenv.config()

// Node <20 no expone Web Crypto como global. otplib (@noble/hashes) usa
// `globalThis.crypto.getRandomValues`, así que lo definimos si falta.
import { webcrypto } from 'node:crypto'
if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

import { validateEnv } from '@config/env.validator.js'
validateEnv()

import app from './app.js'
import { DatabaseService } from '@database/connection.js'
import { configureCloudinary } from '@config/cloudinary.config.js'
import { Server } from 'http'

const PORT = process.env.PORT ?? 3000

configureCloudinary()

let serverInstance: Server

const startServer = async (): Promise<void> => {
  try {
    await DatabaseService.getInstance().connect()
    console.log('Conexión a la base de datos Turso establecida con éxito.')

    serverInstance = app.listen(PORT, () => {
      console.log(`Servidor ejecutándose en el puerto ${PORT}`)
      console.log(`Entorno: ${process.env.NODE_ENV}`)
    })
  } catch (error) {
    console.error('Error fatal al iniciar el servidor:', error)
    process.exit(1)
  }
}

const gracefulShutdown = (): void => {
  console.log('Iniciando cierre elegante del servidor...')
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('Servidor HTTP cerrado.')
      process.exit(0)
    })
  } else {
    process.exit(0)
  }
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

startServer()
