import { Request } from 'express'

export interface JwtPayload {
  userId: number
  username: string
  // Id único de sesión: dos logins del mismo usuario en el mismo segundo
  // producirían tokens idénticos sin esto (ver login en auth.controller).
  jti?: string
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload
}

export interface BaseResponse {
  message: string
}
