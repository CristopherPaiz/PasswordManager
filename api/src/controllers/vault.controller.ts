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
      sql: 'SELECT kdf_salt, kdf_params, wrapped_vault_key FROM Usuarios WHERE id = ?',
      args: [userId ?? 0]
    })

    if (rows.length === 0 || !rows[0].kdf_salt) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.AUTH.UNAUTHORIZED })
      return
    }

    // Todas las passkeys del usuario: el navegador intentará con la disponible
    // en ESTE dispositivo (allowCredentials) y casa por cred_id.
    const { rows: passkeys } = await dbClient.execute({
      sql: 'SELECT cred_id, wrapped_vault_key FROM Passkeys WHERE usuario_id = ?',
      args: [userId ?? 0]
    })

    res.status(HTTP_STATUS.OK).json({
      kdf_salt: String(rows[0].kdf_salt),
      kdf_params: JSON.parse(String(rows[0].kdf_params)),
      wrapped_vault_key: rows[0].wrapped_vault_key
        ? JSON.parse(String(rows[0].wrapped_vault_key))
        : null,
      passkeys: passkeys.map((p) => ({
        cred_id: String(p.cred_id),
        wrapped_vault_key: JSON.parse(String(p.wrapped_vault_key))
      }))
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
      sql: `SELECT id, tipo, ciphertext, iv, uid, fecha_creacion, fecha_modificacion
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
    const { tipo, ciphertext, iv, uid } = req.body

    const dbClient = await DatabaseService.getInstance().getClient()
    const result = await dbClient.execute({
      sql: 'INSERT INTO VaultItems (usuario_id, tipo, ciphertext, iv, uid) VALUES (?, ?, ?, ?, ?)',
      args: [userId ?? 0, tipo ?? 'password', ciphertext, iv, uid]
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
    const { tipo, ciphertext, iv, uid } = req.body

    const dbClient = await DatabaseService.getInstance().getClient()
    // uid con COALESCE: los items legacy (uid NULL) lo adquieren al editarse;
    // un uid ya asignado nunca se pisa (el AAD del blob quedaría huérfano).
    const result = await dbClient.execute({
      sql: `UPDATE VaultItems
              SET ciphertext = ?, iv = ?, tipo = COALESCE(?, tipo),
                  uid = COALESCE(uid, ?), fecha_modificacion = CURRENT_TIMESTAMP
            WHERE id = ? AND usuario_id = ?`,
      args: [ciphertext, iv, tipo ?? null, uid ?? null, itemId, userId ?? 0]
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

// Inserta varios items cifrados de una (import/restauración). Todo o nada (batch).
export const bulkCreateVaultItems = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const { items } = req.body as {
      items: { tipo?: string; ciphertext: string; iv: string; uid: string }[]
    }

    const dbClient = await DatabaseService.getInstance().getClient()
    const statements = items.map((it) => ({
      sql: 'INSERT INTO VaultItems (usuario_id, tipo, ciphertext, iv, uid) VALUES (?, ?, ?, ?, ?)',
      args: [userId ?? 0, it.tipo ?? 'password', it.ciphertext, it.iv, it.uid]
    }))

    await dbClient.batch(statements)

    res.status(HTTP_STATUS.CREATED).json({ message: 'Elementos importados.', count: items.length })
  } catch (error) {
    next(error)
  }
}

// ---------- Manifiesto del baúl (integridad: anti-borrado y anti-rollback) ----------
//
// El AAD por item impide que el server intercambie ciphertexts, pero NO que
// borre filas o devuelva una versión vieja de un item: el cliente no tiene con
// qué comparar. El manifiesto es ese punto de comparación: un blob cifrado con
// la vaultKey que lista el uid de cada item y un digest de su ciphertext, más
// una versión que solo avanza. El server no puede leerlo ni forjarlo (no tiene
// la vaultKey), así que cualquier item borrado, revertido o inyectado por el
// servidor se detecta al abrir el baúl.

export const getVaultManifest = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const dbClient = await DatabaseService.getInstance().getClient()

    const { rows } = await dbClient.execute({
      sql: 'SELECT vault_manifest, vault_manifest_version FROM Usuarios WHERE id = ?',
      args: [userId ?? 0]
    })

    if (rows.length === 0) {
      res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.AUTH.UNAUTHORIZED })
      return
    }

    res.status(HTTP_STATUS.OK).json({
      manifest: rows[0].vault_manifest ? JSON.parse(String(rows[0].vault_manifest)) : null,
      version: Number(rows[0].vault_manifest_version ?? 0)
    })
  } catch (error) {
    next(error)
  }
}

// La versión debe AVANZAR siempre. Rechazar un retroceso evita que un cliente
// desincronizado (o una carrera entre dos pestañas) pise el manifiesto con uno
// viejo y dispare falsas alarmas de integridad. Contra un server hostil esto no
// prueba nada: la defensa real es que el cliente recuerda la última versión que
// vio y desconfía si el server le devuelve una menor.
export const putVaultManifest = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId
    const { manifest, version } = req.body as {
      manifest: { iv: string; ct: string }
      version: number
    }

    const dbClient = await DatabaseService.getInstance().getClient()
    const result = await dbClient.execute({
      sql: `UPDATE Usuarios
              SET vault_manifest = ?, vault_manifest_version = ?
            WHERE id = ? AND vault_manifest_version < ?`,
      args: [JSON.stringify(manifest), version, userId ?? 0, version]
    })

    if (result.rowsAffected === 0) {
      const { rows } = await dbClient.execute({
        sql: 'SELECT vault_manifest_version FROM Usuarios WHERE id = ?',
        args: [userId ?? 0]
      })

      if (rows.length === 0) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.AUTH.UNAUTHORIZED })
        return
      }

      res.status(HTTP_STATUS.CONFLICT).json({
        message: 'Versión del manifiesto desactualizada.',
        version: Number(rows[0].vault_manifest_version ?? 0)
      })
      return
    }

    res.status(HTTP_STATUS.OK).json({ message: 'Manifiesto actualizado.', version })
  } catch (error) {
    next(error)
  }
}
