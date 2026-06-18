import { Router } from 'express'
import { getConfigs } from '@controllers/config.controller.js'

const router = Router()

router.get('/', getConfigs)

export default router
