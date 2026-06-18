import { DatabaseService } from './connection.js'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'

dotenv.config()

const initializeDatabase = async (): Promise<void> => {
  try {
    const dbClient = await DatabaseService.getInstance().getClient()

    await dbClient.execute(`
      CREATE TABLE IF NOT EXISTS Usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        nombre TEXT,
        apellido TEXT,
        activo INTEGER DEFAULT 1,
        ultimo_login DATETIME,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await dbClient.execute(`
      CREATE TABLE IF NOT EXISTS Sesiones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        fecha_expiracion DATETIME NOT NULL,
        activa INTEGER DEFAULT 1,
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

    const { rows: userCount } = await dbClient.execute('SELECT COUNT(*) as count FROM Usuarios')

    if (Number(userCount[0].count) === 0) {
      const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@admin.com'
      const adminPass = process.env.ADMIN_PASSWORD ?? 'admin'
      const saltRounds = parseInt(process.env.SALT_ROUNDS ?? '10')

      const hashedPassword = await bcrypt.hash(adminPass, saltRounds)

      await dbClient.execute({
        sql: 'INSERT INTO Usuarios (username, password, email, nombre, apellido, activo) VALUES (?, ?, ?, ?, ?, ?)',
        args: ['admin', hashedPassword, adminEmail, 'Administrador', 'Admin', 1]
      })
    }

    process.exit(0)
  } catch (error) {
    process.exit(1)
  }
}

initializeDatabase()
