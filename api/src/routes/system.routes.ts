import { Router } from 'express'
import { getServerTime } from '@controllers/system.controller.js'

const router = Router()

router.get('/time', getServerTime)

export default router
