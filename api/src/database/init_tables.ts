import { DatabaseService } from './connection.js'
import dotenv from 'dotenv'

dotenv.config()

const initializeDatabase = async (): Promise<void> => {
  try {
    const dbClient = await DatabaseService.getInstance().getClient()

    // Usuarios: además de la cuenta, guarda los parámetros cripto del baúl.
    // IMPORTANTE: `password` NO es la contraseña maestra. Es el bcrypt de un
    // authHash derivado en el navegador (la maestra nunca llega al server).
    // kdf_salt / kdf_params: para re-derivar la llave maestra en el cliente.
    // wrapped_vault_key: la vaultKey (que cifra el baúl) envuelta por la maestra.
    // wrapped_vault_key_recovery: la misma vaultKey envuelta por la llave de recuperación.
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
        passkey_cred_id TEXT,
        wrapped_vault_key_passkey TEXT,
        activo INTEGER DEFAULT 1,
        ultimo_login DATETIME,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Baúl: el server solo ve blobs cifrados. `ciphertext` es el JSON del item
    // (título, usuario, contraseña, url, notas) cifrado con AES-256-GCM en el
    // navegador usando la vaultKey. `iv` es el nonce por item. `tipo` queda en
    // claro solo para poder listar/filtrar sin descifrar (password|note|card...).
    await dbClient.execute(`
      CREATE TABLE IF NOT EXISTS VaultItems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'password',
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
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

    process.exit(0)
  } catch (error) {
    process.exit(1)
  }
}

initializeDatabase()
