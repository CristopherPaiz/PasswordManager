export const validateEnv = (): void => {
  const requiredVariables = [
    'PORT',
    'NODE_ENV',
    'TURSO_DATABASE_URL',
    'TURSO_AUTH_TOKEN',
    'JWT_SECRET_KEY',
    'SALT_ROUNDS',
    'JWT_EXPIRATION_TIME'
  ]

  const missingVariables = requiredVariables.filter((variable) => !process.env[variable])

  if (missingVariables.length > 0) {
    console.error('ERROR CRÍTICO: Faltan las siguientes variables de entorno:')
    missingVariables.forEach((variable) => console.error(`- ${variable}`))
    process.exit(1)
  }

  // Fuerza de los secretos. Un secreto corto/adivinable permite forjar tokens y
  // tomar sesiones. Piso DURO (aborta) solo para secretos peligrosamente cortos;
  // entre HARD_MIN y RECOMMENDED se advierte sin tumbar el arranque, para no
  // provocar un outage por un secreto ya desplegado que es razonable.
  const HARD_MIN = 16
  const RECOMMENDED_MIN = 32

  const checkSecret = (name: string, value: string | undefined, required: boolean): void => {
    if (value === undefined) {
      if (required) {
        console.error(`ERROR CRÍTICO: Falta ${name}.`)
        process.exit(1)
      }
      return
    }
    if (value.length < HARD_MIN) {
      console.error(`ERROR CRÍTICO: ${name} es demasiado corto (mínimo ${HARD_MIN} caracteres).`)
      process.exit(1)
    }
    if (value.length < RECOMMENDED_MIN) {
      console.warn(
        `ADVERTENCIA: ${name} tiene ${value.length} caracteres; se recomienda ≥${RECOMMENDED_MIN} (~256 bits).`
      )
    }
  }

  checkSecret('JWT_SECRET_KEY', process.env.JWT_SECRET_KEY, true)
  checkSecret('TOTP_ENC_KEY', process.env.TOTP_ENC_KEY, false)
}
