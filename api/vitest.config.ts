import { defineConfig } from 'vitest/config'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, 'src')

/**
 * Los alias del API se escriben con extensión `.js` aunque el archivo sea `.ts`
 * (ESM/NodeNext: Node importa el emitido, no el fuente). `vite-tsconfig-paths`
 * no cubre ese caso, así que se mapean a mano: `@config/constants.js` →
 * `src/config/constants.ts`. Un regex cubre todos los alias de carpeta y otro
 * el caso especial `@apptypes` → `src/types`.
 *
 * `pool: "forks"` + `fileParallelism: false`: cada archivo de test corre en su
 * propio proceso y de a uno. Así el singleton de DatabaseService y los stores
 * en memoria de express-rate-limit no se filtran entre archivos, y el test del
 * rate limit es determinista.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@apptypes\/(.*)\.js$/, replacement: `${SRC}/types/$1.ts` },
      {
        find: /^@(config|controllers|middlewares|routes|database|utils|validators)\/(.*)\.js$/,
        replacement: `${SRC}/$1/$2.ts`
      }
    ]
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30000,
    // Entorno mínimo para que el API arranque sin .env real. SALT_ROUNDS bajo:
    // los tests ejercitan la LÓGICA de bcrypt, no su costo (10 rondas × cientos
    // de llamadas serían minutos). El valor de producción vive en .env.
    env: {
      NODE_ENV: 'test',
      JWT_SECRET_KEY: 'test-secret-key-no-usar-en-produccion',
      JWT_EXPIRATION_TIME: '7d',
      SALT_ROUNDS: '4',
      FRONTEND_URL: 'http://localhost:5173',
      TURSO_DATABASE_URL: ':memory:',
      TURSO_AUTH_TOKEN: 'test'
    }
  }
})
