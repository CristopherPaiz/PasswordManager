import { Router } from 'express'
import {
  getVaultKeys,
  listVaultItems,
  createVaultItem,
  updateVaultItem,
  deleteVaultItem,
  bulkCreateVaultItems
} from '@controllers/vault.controller.js'
import { authMiddleware } from '@middlewares/auth.middleware.js'
import { validate } from '@middlewares/validate.middleware.js'
import { vaultItemSchema, vaultItemUpdateSchema, vaultBulkSchema } from '@validators/vault.schema.js'

const router = Router()

// Todo el baúl exige sesión válida.
router.use(authMiddleware)

router.get('/keys', getVaultKeys)
router.get('/', listVaultItems)
router.post('/', validate(vaultItemSchema), createVaultItem)
router.post('/bulk', validate(vaultBulkSchema), bulkCreateVaultItems)
router.put('/:id', validate(vaultItemUpdateSchema), updateVaultItem)
router.delete('/:id', deleteVaultItem)

export default router
