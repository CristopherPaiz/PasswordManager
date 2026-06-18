import { Request } from 'express'

export interface JwtPayload {
  userId: number
  username: string
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload
}

export interface BaseResponse {
  message: string
}
