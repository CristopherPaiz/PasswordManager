import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt, { SignOptions } from 'jsonwebtoken'
import { DatabaseService } from '@database/connection.js'
import { HTTP_STATUS, MESSAGES, SYSTEM } from '@config/constants.js'
import { AuthenticatedRequest } from '@apptypes/index.js'

interface DbUser {
  id: number
  username: string
  password?: string
  nombre?: string
  apellido?: string
  activo?: number
  kdf_salt?: string
  kdf_params?: string
  wrapped_vault_key?: string
}

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      username,
      password,
      email,
      nombre,
      apellido,
      kdf_salt,
      kdf_params,
      wrapped_vault_key,
      wrapped_vault_key_recovery
    } = req.body

    if (!username || !password || !email) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.AUTH.MISSING_CREDENTIALS })
      return
    }

    const dbClient = await DatabaseService.getInstance().getClient()

    const { rows: existingUsers } = await dbClient.execute({
      sql: 'SELECT id FROM Usuarios WHERE username = ?',
      args: [username]
    })

    if (existingUsers.length > 0) {
      res.status(HTTP_STATUS.CONFLICT).json({ message: MESSAGES.AUTH.USER_EXISTS })
      return
    }

    const saltRounds = parseInt(process.env.SALT_ROUNDS ?? String(SYSTEM.DEFAULT_SALT_ROUNDS))
    // `password` aquí es el authHash derivado en el navegador, no la maestra.
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    const result = await dbClient.execute({
      sql: `INSERT INTO Usuarios
              (username, password, email, nombre, apellido, kdf_salt, kdf_params, wrapped_vault_key, wrapped_vault_key_recovery)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        username,
        hashedPassword,
        email,
        nombre ?? null,
        apellido ?? null,
        kdf_salt,
        JSON.stringify(kdf_params),
        JSON.stringify(wrapped_vault_key),
        JSON.stringify(wrapped_vault_key_recovery)
      ]
    })

    res.status(HTTP_STATUS.CREATED).json({
      message: 'Usuario registrado exitosamente',
      user: {
        id: Number(result.lastInsertRowid),
        username,
        email,
        nombre: nombre ?? null,
        apellido: apellido ?? null
      }
    })
  } catch (error) {
    next(error)
  }
}

// Pre-login: entrega salt + params del KDF para que el cliente derive el authHash.
// Los salts no son secretos. Si el usuario no existe, 404 genérico.
export const prelogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { username } = req.body

    const dbClient = await DatabaseService.getInstance().getClient()
    const { rows } = await dbClient.execute({
      sql: 'SELECT kdf_salt, kdf_params FROM Usuarios WHERE username = ? AND activo = 1',
      args: [username]
    })

    if (rows.length === 0 || !rows[0].kdf_salt) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.AUTH.INVALID_CREDENTIALS })
      return
    }

    res.status(HTTP_STATUS.OK).json({
      kdf_salt: String(rows[0].kdf_salt),
      kdf_params: JSON.parse(String(rows[0].kdf_params))
    })
  } catch (error) {
    next(error)
  }
}

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.AUTH.MISSING_CREDENTIALS })
      return
    }

    const dbClient = await DatabaseService.getInstance().getClient()

    const { rows: users } = await dbClient.execute({
      sql: 'SELECT * FROM Usuarios WHERE username = ? AND activo = 1',
      args: [username]
    })

    if (users.length === 0) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.AUTH.INVALID_CREDENTIALS })
      return
    }

    const user = users[0] as unknown as DbUser

    if (!user.password) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.AUTH.INVALID_CREDENTIALS })
      return
    }

    const passwordMatch = await bcrypt.compare(password, user.password)

    if (!passwordMatch) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.AUTH.INVALID_CREDENTIALS })
      return
    }

    await dbClient.execute({
      sql: "UPDATE Usuarios SET ultimo_login = STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW') WHERE id = ?",
      args: [user.id]
    })

    const secretKey = String(process.env.JWT_SECRET_KEY)
    const expiresInConfig = process.env.JWT_EXPIRATION_TIME ?? SYSTEM.DEFAULT_JWT_EXPIRATION

    const token = jwt.sign(
      { userId: Number(user.id), username: String(user.username) },
      secretKey,
      { expiresIn: expiresInConfig as SignOptions['expiresIn'] }
    )

    const expirationDate = new Date()
    expirationDate.setDate(expirationDate.getDate() + 7)

    // Limpia sesiones expiradas o cerradas para que la tabla no crezca sin límite.
    await dbClient.execute({
      sql: 'DELETE FROM Sesiones WHERE fecha_expiracion < ? OR activa = 0',
      args: [new Date().toISOString()]
    })

    await dbClient.execute({
      sql: 'INSERT INTO Sesiones (usuario_id, token, fecha_expiracion, activa) VALUES (?, ?, ?, 1)',
      args: [user.id, token, expirationDate.toISOString()]
    })

    const isProduction = process.env.NODE_ENV === SYSTEM.ENV_PRODUCTION

    res.cookie(SYSTEM.COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    })

    res.status(HTTP_STATUS.OK).json({
      message: MESSAGES.AUTH.LOGIN_SUCCESS,
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        apellido: user.apellido
      },
      // El cliente ya derivó la wrapKey en el prelogin; con esto desenvuelve la
      // vaultKey sin un segundo viaje. El server no puede abrir este blob.
      wrapped_vault_key: user.wrapped_vault_key ? JSON.parse(user.wrapped_vault_key) : null
    })
  } catch (error) {
    next(error)
  }
}

export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.cookies[SYSTEM.COOKIE_NAME]

    if (token) {
      const dbClient = await DatabaseService.getInstance().getClient()
      await dbClient.execute({
        sql: 'UPDATE Sesiones SET activa = 0 WHERE token = ?',
        args: [token]
      })
    }

    const isProduction = process.env.NODE_ENV === SYSTEM.ENV_PRODUCTION

    res.cookie(SYSTEM.COOKIE_NAME, '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      expires: new Date(0),
      path: '/'
    })

    res.status(HTTP_STATUS.OK).json({
      message: MESSAGES.AUTH.LOGOUT_SUCCESS,
      authenticated: false
    })
  } catch (error) {
    next(error)
  }
}

export const getMe = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId

    if (!userId) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.AUTH.UNAUTHORIZED })
      return
    }

    const dbClient = await DatabaseService.getInstance().getClient()

    const { rows: users } = await dbClient.execute({
      sql: 'SELECT id, username, nombre, apellido, activo FROM Usuarios WHERE id = ?',
      args: [userId]
    })

    if (users.length === 0) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: 'Usuario no encontrado.' })
      return
    }

    const user = users[0] as unknown as DbUser

    if (!user.activo) {
      res.clearCookie(SYSTEM.COOKIE_NAME)
      res.status(HTTP_STATUS.FORBIDDEN).json({ message: 'La cuenta de usuario está inactiva.' })
      return
    }

    res.status(HTTP_STATUS.OK).json({
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        apellido: user.apellido
      }
    })
  } catch (error) {
    next(error)
  }
}
