import { Response, NextFunction } from 'express'
import { DatabaseService } from '@database/connection.js'
import { HTTP_STATUS, MESSAGES } from '@config/constants.js'
import { AuthenticatedRequest } from '@apptypes/index.js'

// Todos los endpoints exigen authMiddleware: req.user.userId está garantizado.

// Devuelve los parámetros para re-derivar la llave y desenvolver la vaultKey.
// Se usa al recargar (sesión válida pero baúl bloqueado): el cliente pide esto,
// vuelve a pedir la maestra y desenvuelve la vaultKey en memoria.
export const getVaultKeys = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const dbClient = await DatabaseService.getInstance().getClient()

    const { rows } = await dbClient.execute({
      sql: `SELECT kdf_salt, kdf_params, wrapped_vault_key, passkey_cred_id, wrapped_vault_key_passkey
              FROM Usuarios WHERE id = ?`,
      args: [userId ?? 0]
    })

    if (rows.length === 0 || !rows[0].kdf_salt) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.AUTH.UNAUTHORIZED })
      return
    }

    res.status(HTTP_STATUS.OK).json({
      kdf_salt: String(rows[0].kdf_salt),
      kdf_params: JSON.parse(String(rows[0].kdf_params)),
      wrapped_vault_key: rows[0].wrapped_vault_key
        ? JSON.parse(String(rows[0].wrapped_vault_key))
        : null,
      // Para desbloqueo con huella (si el usuario lo activó en este dispositivo/cuenta).
      passkey_cred_id: rows[0].passkey_cred_id ? String(rows[0].passkey_cred_id) : null,
      wrapped_vault_key_passkey: rows[0].wrapped_vault_key_passkey
        ? JSON.parse(String(rows[0].wrapped_vault_key_passkey))
        : null
    })
  } catch (error) {
    next(error)
  }
}

export const listVaultItems = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const dbClient = await DatabaseService.getInstance().getClient()

    const { rows } = await dbClient.execute({
      sql: `SELECT id, tipo, ciphertext, iv, fecha_creacion, fecha_modificacion
              FROM VaultItems WHERE usuario_id = ? ORDER BY fecha_modificacion DESC`,
      args: [userId ?? 0]
    })

    res.status(HTTP_STATUS.OK).json({ items: rows })
  } catch (error) {
    next(error)
  }
}

export const createVaultItem = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const { tipo, ciphertext, iv } = req.body

    const dbClient = await DatabaseService.getInstance().getClient()
    const result = await dbClient.execute({
      sql: 'INSERT INTO VaultItems (usuario_id, tipo, ciphertext, iv) VALUES (?, ?, ?, ?)',
      args: [userId ?? 0, tipo ?? 'password', ciphertext, iv]
    })

    res.status(HTTP_STATUS.CREATED).json({
      message: 'Elemento guardado.',
      id: Number(result.lastInsertRowid)
    })
  } catch (error) {
    next(error)
  }
}

export const updateVaultItem = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const itemId = Number(req.params.id)
    const { tipo, ciphertext, iv } = req.body

    const dbClient = await DatabaseService.getInstance().getClient()
    const result = await dbClient.execute({
      sql: `UPDATE VaultItems
              SET ciphertext = ?, iv = ?, tipo = COALESCE(?, tipo),
                  fecha_modificacion = CURRENT_TIMESTAMP
            WHERE id = ? AND usuario_id = ?`,
      args: [ciphertext, iv, tipo ?? null, itemId, userId ?? 0]
    })

    if (result.rowsAffected === 0) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: 'Elemento no encontrado.' })
      return
    }

    res.status(HTTP_STATUS.OK).json({ message: 'Elemento actualizado.' })
  } catch (error) {
    next(error)
  }
}

export const deleteVaultItem = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const itemId = Number(req.params.id)

    const dbClient = await DatabaseService.getInstance().getClient()
    const result = await dbClient.execute({
      sql: 'DELETE FROM VaultItems WHERE id = ? AND usuario_id = ?',
      args: [itemId, userId ?? 0]
    })

    if (result.rowsAffected === 0) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: 'Elemento no encontrado.' })
      return
    }

    res.status(HTTP_STATUS.OK).json({ message: 'Elemento eliminado.' })
  } catch (error) {
    next(error)
  }
}
