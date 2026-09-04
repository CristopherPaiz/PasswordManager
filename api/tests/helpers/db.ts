import { createClient, Client } from '@libsql/client'
import { DatabaseService } from '@database/connection.js'
import { applySchema } from '@database/init_tables.js'

// Las tablas se vacían entre tests en orden hijo → padre (FKs).
const TABLES = ['Sesiones', 'Passkeys', 'VaultItems', 'ErrorLogs', 'Usuarios']

// El singleton guarda el cliente en un campo privado. En los tests se inyecta
// uno en memoria: así corre el MISMO código de producción (DatabaseService.
// getInstance().getClient()) sin mockear el módulo ni tocar Turso.
interface DatabaseServiceInternals {
  client: Client | null
}

let testClient: Client | null = null

/**
 * Levanta una BD SQLite en memoria con el esquema real de `init_tables.ts` y la
 * inyecta en el singleton. Si el esquema cambia, los tests lo ven sin duplicar DDL.
 */
export const setupTestDb = async (): Promise<Client> => {
  const client = createClient({ url: ':memory:' })
  await applySchema(client)

  const internals = DatabaseService.getInstance() as unknown as DatabaseServiceInternals
  internals.client = client
  testClient = client

  return client
}

export const getTestDb = (): Client => {
  if (!testClient) throw new Error('setupTestDb() no fue llamado.')
  return testClient
}

export const resetTestDb = async (): Promise<void> => {
  const client = getTestDb()
  for (const table of TABLES) {
    await client.execute(`DELETE FROM ${table}`)
  }
}

export const closeTestDb = (): void => {
  testClient?.close()
  testClient = null
  const internals = DatabaseService.getInstance() as unknown as DatabaseServiceInternals
  internals.client = null
}
