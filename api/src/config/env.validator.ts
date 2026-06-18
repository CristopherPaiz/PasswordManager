export const validateEnv = (): void => {
  const requiredVariables = [
    'PORT',
    'NODE_ENV',
    'TURSO_DATABASE_URL',
    'TURSO_AUTH_TOKEN',
    'JWT_SECRET_KEY',
    'SALT_ROUNDS',
    'JWT_EXPIRATION_TIME',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET'
  ]

  const missingVariables = requiredVariables.filter((variable) => !process.env[variable])

  if (missingVariables.length > 0) {
    console.error('ERROR CRÍTICO: Faltan las siguientes variables de entorno:')
    missingVariables.forEach((variable) => console.error(`- ${variable}`))
    process.exit(1)
  }
}
