import { Client } from '@libsql/client'
import { pathToFileURL } from 'node:url'
import { DatabaseService } from './connection.js'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Único punto de verdad del esquema (idempotente, `CREATE TABLE IF NOT EXISTS`).
 * Se exporta como función para que los tests puedan levantar el MISMO esquema
 * contra una BD en memoria: si una columna se agrega aquí, los tests la ven sin
 * duplicar DDL (y si falta, fallan). No es un archivo de migración: sigue siendo
 * el estado deseado completo, no un delta.
 */
export const applySchema = async (dbClient: Client): Promise<void> => {
  // Usuarios: además de la cuenta, guarda los parámetros cripto del baúl.
  // IMPORTANTE: `password` NO es la contraseña maestra. Es el bcrypt de un
  // authHash derivado en el navegador (la maestra nunca llega al server).
  // kdf_salt / kdf_params: para re-derivar la llave maestra en el cliente.
  // wrapped_vault_key: la vaultKey (que cifra el baúl) envuelta por la maestra.
  // wrapped_vault_key_recovery: la misma vaultKey envuelta por la llave de recuperación.
  // totp_last_step: último paso de tiempo TOTP aceptado (RFC 6238). Impide
  // reusar un código dentro de su ventana de validez (anti-replay).
  // vault_manifest / vault_manifest_version: inventario firmado del baúl,
  // cifrado con la vaultKey (el server no lo abre). Detecta borrados o
  // reversiones hechas desde el servidor. La versión es monótona.
  // El server NUNCA puede abrir estos blobs: es zero-knowledge.
  await dbClient.execute(`
      CREATE TABLE IF NOT EXISTS Usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        nombre TEXT,
        apellido TEXT,
        kdf_salt TEXT,
        kdf_params TEXT,
        wrapped_vault_key TEXT,
        wrapped_vault_key_recovery TEXT,
        recovery_hash TEXT,
        totp_secret TEXT,
        totp_enabled INTEGER DEFAULT 0,
        totp_last_step INTEGER,
        vault_manifest TEXT,
        vault_manifest_version INTEGER NOT NULL DEFAULT 0,
        rol TEXT NOT NULL DEFAULT 'user',
        activo INTEGER DEFAULT 1,
        ultimo_login DATETIME,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

  // Baúl: el server solo ve blobs cifrados. `ciphertext` es el JSON del item
  // (título, usuario, contraseña, url, notas) cifrado con AES-256-GCM en el
  // navegador usando la vaultKey. `iv` es el nonce por item. `tipo` queda en
  // claro solo para poder listar/filtrar sin descifrar (password|note|card).
  // `uid`: id generado por el cliente, usado como AAD del GCM; liga el blob a
  // su fila (el server no puede intercambiar ciphertexts entre items). Carpetas,
  // etiquetas y favoritos viven DENTRO del blob: el server no ve esa metadata.
  await dbClient.execute(`
      CREATE TABLE IF NOT EXISTS VaultItems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'password',
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        uid TEXT,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_modificacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE
      )
    `)

  // Passkeys: una por dispositivo. Cada una guarda la vaultKey envuelta por el
  // secreto PRF de ESE autenticador (Windows Hello, Touch ID, teléfono...).
  // `label` es un nombre legible del dispositivo/navegador para mostrar la lista.
  await dbClient.execute(`
      CREATE TABLE IF NOT EXISTS Passkeys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        cred_id TEXT NOT NULL UNIQUE,
        wrapped_vault_key TEXT NOT NULL,
        label TEXT,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE
      )
    `)

  await dbClient.execute(`
      CREATE TABLE IF NOT EXISTS Sesiones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        fecha_expiracion DATETIME NOT NULL,
        activa INTEGER DEFAULT 1,
        user_agent TEXT,
        ip TEXT,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE
      )
    `)

  await dbClient.execute(`
      CREATE TABLE IF NOT EXISTS ErrorLogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        error_message TEXT NOT NULL,
        stack_trace TEXT,
        resuelto INTEGER DEFAULT 0,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

  await dbClient.execute(`
      CREATE TABLE IF NOT EXISTS Configuraciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        Nombre TEXT NOT NULL UNIQUE,
        Valor TEXT NOT NULL
      )
    `)

  // Índices: las lecturas calientes filtran por usuario (baúl, sesiones,
  // passkeys) y el middleware de auth busca la sesión por hash de token en
  // CADA request. Sin ellos SQLite hace scan completo de la tabla.
  await dbClient.execute(
    'CREATE INDEX IF NOT EXISTS idx_vaultitems_usuario ON VaultItems(usuario_id, fecha_modificacion DESC)'
  )
  await dbClient.execute('CREATE INDEX IF NOT EXISTS idx_sesiones_token ON Sesiones(token)')
  await dbClient.execute(
    'CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON Sesiones(usuario_id, activa)'
  )
  await dbClient.execute(
    'CREATE INDEX IF NOT EXISTS idx_sesiones_expiracion ON Sesiones(fecha_expiracion)'
  )
  await dbClient.execute('CREATE INDEX IF NOT EXISTS idx_passkeys_usuario ON Passkeys(usuario_id)')

  const { rows: configCount } = await dbClient.execute(
    "SELECT COUNT(*) as count FROM Configuraciones WHERE Nombre = 'nombreApp'"
  )

  if (Number(configCount[0].count) === 0) {
    await dbClient.execute({
      sql: 'INSERT INTO Configuraciones (Nombre, Valor) VALUES (?, ?)',
      args: ['nombreApp', 'Plantilla Web']
    })
  }

  // Nota: NO se siembra un usuario admin. En un gestor de contraseñas la
  // primera cuenta se crea por el flujo de registro (que genera salt, vaultKey
  // y llave de recuperación en el navegador). Un admin con bcrypt('admin') no
  // tendría parámetros cripto y no podría abrir ningún baúl.
}

const initializeDatabase = async (): Promise<void> => {
  try {
    const dbClient = await DatabaseService.getInstance().getClient()
    await applySchema(dbClient)
    process.exit(0)
  } catch (error) {
    process.exit(1)
  }
}

// Solo corre el runner cuando se ejecuta el archivo directo (`pnpm db:init`).
// Importarlo (tests) solo trae `applySchema`, sin tocar Turso ni matar el proceso.
const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (entry === import.meta.url) {
  initializeDatabase()
}
