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

  // Fuerza del secreto JWT: un secreto corto/adivinable permite forjar tokens y
  // tomar sesiones. Exige al menos 32 caracteres (~256 bits).
  if ((process.env.JWT_SECRET_KEY ?? '').length < 32) {
    console.error('ERROR CRÍTICO: JWT_SECRET_KEY debe tener al menos 32 caracteres.')
    process.exit(1)
  }

  // Si se define una llave dedicada para cifrar secretos TOTP, también debe ser fuerte.
  if (process.env.TOTP_ENC_KEY !== undefined && process.env.TOTP_ENC_KEY.length < 32) {
    console.error('ERROR CRÍTICO: TOTP_ENC_KEY debe tener al menos 32 caracteres.')
    process.exit(1)
  }
}
