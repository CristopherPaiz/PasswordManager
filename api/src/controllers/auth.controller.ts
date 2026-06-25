import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt, { SignOptions } from 'jsonwebtoken'
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib'
import QRCode from 'qrcode'
import { DatabaseService } from '@database/connection.js'
import { HTTP_STATUS, MESSAGES, SYSTEM } from '@config/constants.js'
import { AuthenticatedRequest } from '@apptypes/index.js'
import { encryptSecret, decryptSecret, hashToken } from '@utils/crypto.helper.js'

// Tolera ±30s de desfase de reloj al verificar códigos TOTP.
const TOTP_EPOCH_TOLERANCE = 30

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
  totp_secret?: string
  totp_enabled?: number
  passkey_cred_id?: string
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
      wrapped_vault_key_recovery,
      recovery_auth
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
    // recovery_auth: hash de posesión de la llave de recuperación, bcrypt-eado.
    const recoveryHash = await bcrypt.hash(recovery_auth, saltRounds)

    const result = await dbClient.execute({
      sql: `INSERT INTO Usuarios
              (username, password, email, nombre, apellido, kdf_salt, kdf_params, wrapped_vault_key, wrapped_vault_key_recovery, recovery_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        username,
        hashedPassword,
        email,
        nombre ?? null,
        apellido ?? null,
        kdf_salt,
        JSON.stringify(kdf_params),
        JSON.stringify(wrapped_vault_key),
        JSON.stringify(wrapped_vault_key_recovery),
        recoveryHash
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
    const { username, password, token: totpToken } = req.body

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

    // Segundo factor: si el usuario tiene TOTP activo, exige el código antes de
    // emitir la cookie. Sin token válido NO hay sesión.
    if (user.totp_enabled && user.totp_secret) {
      if (!totpToken) {
        res.status(HTTP_STATUS.OK).json({ totpRequired: true })
        return
      }
      const result = await verifyTotp({
        token: String(totpToken),
        secret: decryptSecret(user.totp_secret),
        epochTolerance: TOTP_EPOCH_TOLERANCE
      })
      if (!result.valid) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: 'Código de verificación inválido.' })
        return
      }
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
      sql: 'INSERT INTO Sesiones (usuario_id, token, fecha_expiracion, activa, user_agent, ip) VALUES (?, ?, ?, 1, ?, ?)',
      args: [
        user.id,
        // Guarda el hash del token, no el JWT en claro: una fuga de BD no entrega
        // tokens usables. El middleware compara contra hashToken(cookie).
        hashToken(token),
        expirationDate.toISOString(),
        req.headers['user-agent'] ?? null,
        req.ip ?? null
      ]
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
        args: [hashToken(token)]
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
      sql: 'SELECT id, username, nombre, apellido, activo, totp_enabled FROM Usuarios WHERE id = ?',
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

    const { rows: pkCount } = await dbClient.execute({
      sql: 'SELECT COUNT(*) as c FROM Passkeys WHERE usuario_id = ?',
      args: [userId]
    })

    res.status(HTTP_STATUS.OK).json({
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        apellido: user.apellido,
        totpEnabled: Boolean(user.totp_enabled),
        passkeyEnabled: Number(pkCount[0].c) > 0
      }
    })
  } catch (error) {
    next(error)
  }
}

// ---------- Passkey / huella (desbloqueo del baúl con WebAuthn PRF) ----------

// Registra una passkey (una por dispositivo): guarda cred_id + vaultKey envuelta
// por el secreto PRF de ese autenticador. Re-registrar el mismo cred_id actualiza.
export const passkeyRegister = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const { cred_id, wrapped_vault_key, label } = req.body
    const dbClient = await DatabaseService.getInstance().getClient()

    await dbClient.execute({
      sql: `INSERT INTO Passkeys (usuario_id, cred_id, wrapped_vault_key, label)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(cred_id) DO UPDATE SET
              wrapped_vault_key = excluded.wrapped_vault_key,
              label = excluded.label`,
      args: [userId ?? 0, cred_id, JSON.stringify(wrapped_vault_key), label ?? null]
    })

    res.status(HTTP_STATUS.OK).json({ message: 'Desbloqueo con huella activado.' })
  } catch (error) {
    next(error)
  }
}

// Lista las passkeys registradas (solo metadatos para mostrar; sin blobs).
export const passkeyList = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const dbClient = await DatabaseService.getInstance().getClient()

    const { rows } = await dbClient.execute({
      sql: 'SELECT id, label, fecha_creacion FROM Passkeys WHERE usuario_id = ? ORDER BY fecha_creacion DESC',
      args: [userId ?? 0]
    })

    res.status(HTTP_STATUS.OK).json({ passkeys: rows })
  } catch (error) {
    next(error)
  }
}

// Elimina una passkey por id (solo si pertenece al usuario).
export const passkeyDelete = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const passkeyId = Number(req.params.id)
    const dbClient = await DatabaseService.getInstance().getClient()

    const result = await dbClient.execute({
      sql: 'DELETE FROM Passkeys WHERE id = ? AND usuario_id = ?',
      args: [passkeyId, userId ?? 0]
    })

    if (result.rowsAffected === 0) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: 'Passkey no encontrada.' })
      return
    }

    res.status(HTTP_STATUS.OK).json({ message: 'Desbloqueo con huella desactivado.' })
  } catch (error) {
    next(error)
  }
}

// ---------- Cambiar contraseña maestra (estando dentro) ----------

// Verifica la maestra ACTUAL (su authHash) y aplica la nueva: el cliente ya
// re-envolvió la vaultKey con la maestra nueva, así que el contenido no cambia.
export const changeMaster = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const { current_password, password, kdf_salt, kdf_params, wrapped_vault_key } = req.body
    const dbClient = await DatabaseService.getInstance().getClient()

    const { rows } = await dbClient.execute({
      sql: 'SELECT password FROM Usuarios WHERE id = ?',
      args: [userId ?? 0]
    })

    if (rows.length === 0 || !rows[0].password) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: 'Usuario no encontrado.' })
      return
    }

    const ok = await bcrypt.compare(current_password, String(rows[0].password))
    if (!ok) {
      res
        .status(HTTP_STATUS.UNAUTHORIZED)
        .json({ message: 'Contraseña maestra actual incorrecta.' })
      return
    }

    const saltRounds = parseInt(process.env.SALT_ROUNDS ?? String(SYSTEM.DEFAULT_SALT_ROUNDS))
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    await dbClient.execute({
      sql: 'UPDATE Usuarios SET password = ?, kdf_salt = ?, kdf_params = ?, wrapped_vault_key = ? WHERE id = ?',
      args: [
        hashedPassword,
        kdf_salt,
        JSON.stringify(kdf_params),
        JSON.stringify(wrapped_vault_key),
        userId ?? 0
      ]
    })

    // Cambiar la maestra invalida las DEMÁS sesiones (por si alguna está
    // comprometida); conserva solo la sesión actual desde la que se hizo el cambio.
    const currentToken = req.cookies[SYSTEM.COOKIE_NAME]
    await dbClient.execute({
      sql: 'UPDATE Sesiones SET activa = 0 WHERE usuario_id = ? AND token != ?',
      args: [userId ?? 0, currentToken ? hashToken(currentToken) : '']
    })

    res.status(HTTP_STATUS.OK).json({ message: 'Contraseña maestra actualizada.' })
  } catch (error) {
    next(error)
  }
}

// ---------- Gestión de sesiones ----------

// Lista las sesiones activas (sin exponer el token); marca la actual.
export const sessionsList = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const currentToken = req.cookies[SYSTEM.COOKIE_NAME]
    const currentTokenHash = currentToken ? hashToken(currentToken) : ''
    const dbClient = await DatabaseService.getInstance().getClient()
    const nowIso = new Date().toISOString()

    const { rows } = await dbClient.execute({
      sql: `SELECT id, token, user_agent, ip, fecha_creacion, fecha_expiracion
              FROM Sesiones
            WHERE usuario_id = ? AND activa = 1 AND fecha_expiracion > ?
            ORDER BY fecha_creacion DESC`,
      args: [userId ?? 0, nowIso]
    })

    const sessions = rows.map((r) => ({
      id: Number(r.id),
      user_agent: r.user_agent ? String(r.user_agent) : null,
      ip: r.ip ? String(r.ip) : null,
      fecha_creacion: r.fecha_creacion,
      current: String(r.token) === currentTokenHash
    }))

    res.status(HTTP_STATUS.OK).json({ sessions })
  } catch (error) {
    next(error)
  }
}

// Cierra una sesión por id (solo si pertenece al usuario).
export const sessionRevoke = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const sessionId = Number(req.params.id)
    const dbClient = await DatabaseService.getInstance().getClient()

    const result = await dbClient.execute({
      sql: 'UPDATE Sesiones SET activa = 0 WHERE id = ? AND usuario_id = ?',
      args: [sessionId, userId ?? 0]
    })

    if (result.rowsAffected === 0) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: 'Sesión no encontrada.' })
      return
    }

    res.status(HTTP_STATUS.OK).json({ message: 'Sesión cerrada.' })
  } catch (error) {
    next(error)
  }
}

// ---------- Recuperación de maestra por llave de recuperación ----------

// Paso 1: entrega el blob de recovery para que el cliente desenvuelva la vaultKey.
// El blob es inútil sin la llave de recuperación, así que exponerlo es seguro.
export const recoveryStart = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { username } = req.body
    const dbClient = await DatabaseService.getInstance().getClient()

    const { rows } = await dbClient.execute({
      sql: 'SELECT wrapped_vault_key_recovery FROM Usuarios WHERE username = ? AND activo = 1',
      args: [username]
    })

    if (rows.length === 0 || !rows[0].wrapped_vault_key_recovery) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.AUTH.INVALID_CREDENTIALS })
      return
    }

    res.status(HTTP_STATUS.OK).json({
      wrapped_vault_key_recovery: JSON.parse(String(rows[0].wrapped_vault_key_recovery))
    })
  } catch (error) {
    next(error)
  }
}

// Paso 2: aplica la maestra nueva. Autorizado por recovery_auth (bcrypt vs hash).
export const recoveryReset = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { username, recovery_auth, password, kdf_salt, kdf_params, wrapped_vault_key } = req.body
    const dbClient = await DatabaseService.getInstance().getClient()

    const { rows } = await dbClient.execute({
      sql: 'SELECT id, recovery_hash FROM Usuarios WHERE username = ? AND activo = 1',
      args: [username]
    })

    if (rows.length === 0 || !rows[0].recovery_hash) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.AUTH.INVALID_CREDENTIALS })
      return
    }

    const ok = await bcrypt.compare(recovery_auth, String(rows[0].recovery_hash))
    if (!ok) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: 'Llave de recuperación incorrecta.' })
      return
    }

    const userId = Number(rows[0].id)
    const saltRounds = parseInt(process.env.SALT_ROUNDS ?? String(SYSTEM.DEFAULT_SALT_ROUNDS))
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    await dbClient.execute({
      sql: 'UPDATE Usuarios SET password = ?, kdf_salt = ?, kdf_params = ?, wrapped_vault_key = ? WHERE id = ?',
      args: [
        hashedPassword,
        kdf_salt,
        JSON.stringify(kdf_params),
        JSON.stringify(wrapped_vault_key),
        userId
      ]
    })

    // Invalida sesiones activas: tras resetear la maestra se vuelve a entrar.
    await dbClient.execute({
      sql: 'UPDATE Sesiones SET activa = 0 WHERE usuario_id = ?',
      args: [userId]
    })

    res.status(HTTP_STATUS.OK).json({ message: 'Contraseña maestra restablecida.' })
  } catch (error) {
    next(error)
  }
}

// ---------- TOTP (2FA en el login) ----------

// Genera un secreto nuevo (aún no activo) y devuelve el QR para escanear.
export const totpSetup = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const dbClient = await DatabaseService.getInstance().getClient()

    const { rows } = await dbClient.execute({
      sql: 'SELECT username, totp_enabled FROM Usuarios WHERE id = ?',
      args: [userId ?? 0]
    })

    if (rows.length === 0) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: 'Usuario no encontrado.' })
      return
    }

    if (Number(rows[0].totp_enabled) === 1) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'El 2FA ya está activo.' })
      return
    }

    const secret = generateSecret()
    const otpauth = generateURI({
      issuer: 'PasswordManager',
      label: String(rows[0].username),
      secret
    })
    const qr = await QRCode.toDataURL(otpauth)

    // Guarda el secreto provisional (cifrado); se activa solo tras verificar.
    await dbClient.execute({
      sql: 'UPDATE Usuarios SET totp_secret = ?, totp_enabled = 0 WHERE id = ?',
      args: [encryptSecret(secret), userId ?? 0]
    })

    res.status(HTTP_STATUS.OK).json({ otpauth, qr, secret })
  } catch (error) {
    next(error)
  }
}

// Verifica un código y activa el 2FA.
export const totpEnable = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const { token } = req.body
    const dbClient = await DatabaseService.getInstance().getClient()

    const { rows } = await dbClient.execute({
      sql: 'SELECT totp_secret FROM Usuarios WHERE id = ?',
      args: [userId ?? 0]
    })

    if (rows.length === 0 || !rows[0].totp_secret) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'Primero genera el código QR.' })
      return
    }

    const result = await verifyTotp({
      token: String(token),
      secret: decryptSecret(String(rows[0].totp_secret)),
      epochTolerance: TOTP_EPOCH_TOLERANCE
    })
    if (!result.valid) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'Código inválido. Intenta de nuevo.' })
      return
    }

    await dbClient.execute({
      sql: 'UPDATE Usuarios SET totp_enabled = 1 WHERE id = ?',
      args: [userId ?? 0]
    })

    res.status(HTTP_STATUS.OK).json({ message: 'Verificación en dos pasos activada.' })
  } catch (error) {
    next(error)
  }
}

// Desactiva el 2FA (exige un código válido para evitar abuso si dejas la sesión abierta).
export const totpDisable = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const { token } = req.body
    const dbClient = await DatabaseService.getInstance().getClient()

    const { rows } = await dbClient.execute({
      sql: 'SELECT totp_secret, totp_enabled FROM Usuarios WHERE id = ?',
      args: [userId ?? 0]
    })

    if (rows.length === 0 || Number(rows[0].totp_enabled) !== 1) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'El 2FA no está activo.' })
      return
    }

    const result = await verifyTotp({
      token: String(token),
      secret: decryptSecret(String(rows[0].totp_secret)),
      epochTolerance: TOTP_EPOCH_TOLERANCE
    })
    if (!result.valid) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'Código inválido. Intenta de nuevo.' })
      return
    }

    await dbClient.execute({
      sql: 'UPDATE Usuarios SET totp_enabled = 0, totp_secret = NULL WHERE id = ?',
      args: [userId ?? 0]
    })

    res.status(HTTP_STATUS.OK).json({ message: 'Verificación en dos pasos desactivada.' })
  } catch (error) {
    next(error)
  }
}
