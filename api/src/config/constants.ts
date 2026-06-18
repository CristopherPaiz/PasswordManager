export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const

export const MESSAGES = {
  AUTH: {
    MISSING_CREDENTIALS: 'Las credenciales son obligatorias.',
    INVALID_CREDENTIALS: 'Usuario o contraseña incorrectos.',
    USER_EXISTS: 'El usuario ya se encuentra registrado.',
    LOGIN_SUCCESS: 'Inicio de sesión exitoso.',
    LOGOUT_SUCCESS: 'Cierre de sesión exitoso.',
    UNAUTHORIZED: 'Acceso denegado. Se requiere autenticación.',
    TOKEN_EXPIRED: 'Sesión expirada. Por favor inicie sesión nuevamente.',
    INVALID_TOKEN: 'Token de acceso inválido.'
  },
  DATABASE: {
    UNAVAILABLE: 'Base de datos no disponible temporalmente.',
    CONNECTION_ERROR: 'Error crítico al conectar con la base de datos.'
  },
  SERVER: {
    ERROR: 'Ocurrió un error interno en el servidor.',
    HEALTHY: 'El servicio está operativo.'
  }
} as const

export const SYSTEM = {
  DEFAULT_SALT_ROUNDS: 10,
  DEFAULT_JWT_EXPIRATION: '7d',
  COOKIE_NAME: 'token',
  ENV_PRODUCTION: 'production',
  ENV_DEVELOPMENT: 'development'
} as const
