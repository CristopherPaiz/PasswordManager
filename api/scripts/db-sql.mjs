import 'dotenv/config'
import { createClient } from '@libsql/client'

// Runner de SQL directo contra Turso. Evita crear archivos de migración:
//   pnpm db:sql "ALTER TABLE Usuarios ADD COLUMN rol TEXT DEFAULT 'user'"
//   pnpm db:sql "CREATE TABLE Notas (id INTEGER PRIMARY KEY, texto TEXT)"
//   pnpm db:sql "SELECT id, username FROM Usuarios LIMIT 5"

const sql = process.argv.slice(2).join(' ').trim()

if (!sql) {
  console.error('Uso: pnpm db:sql "<SQL>"')
  console.error('Ej:  pnpm db:sql "ALTER TABLE Usuarios ADD COLUMN rol TEXT DEFAULT \'user\'"')
  process.exit(1)
}

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error('Faltan TURSO_DATABASE_URL / TURSO_AUTH_TOKEN en .env')
  process.exit(1)
}

const client = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN })

const statements = sql
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean)

try {
  if (statements.length > 1) {
    await client.executeMultiple(sql)
    console.log(`OK. Ejecutadas ${statements.length} sentencias.`)
  } else {
    const result = await client.execute(sql)
    if (result.rows.length > 0) {
      console.table(result.rows)
    } else {
      console.log(`OK. Filas afectadas: ${result.rowsAffected}`)
    }
  }
  process.exit(0)
} catch (error) {
  console.error('Error SQL:', error.message)
  process.exit(1)
}
