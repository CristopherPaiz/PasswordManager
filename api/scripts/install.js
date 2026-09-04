import readline from 'readline'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const askQuestion = (query, defaultValue = '') => {
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${query} (${defaultValue}): ` : `${query}: `
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue)
    })
  })
}

const runInstaller = async () => {
  console.log('\n=== INICIANDO CONFIGURACIÓN DEL PROYECTO ===\n')

  const projectName = await askQuestion('Nombre del proyecto', 'mi-backend')

  const packageJsonPath = path.join(__dirname, '..', 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    packageData.name = projectName.toLowerCase().replace(/\s+/g, '-')
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageData, null, 2))
    console.log(`\n[OK] package.json actualizado con el nombre: ${packageData.name}`)
  }

  const port = await askQuestion('Puerto del servidor', '3000')
  const nodeEnv = await askQuestion('Entorno (NODE_ENV)', 'production')
  const frontendUrl = await askQuestion('URL del Frontend', 'http://localhost:5173')
  const corsOrigins = await askQuestion('Orígenes CORS extra (separados por comas)', frontendUrl)

  const tursoUrl = await askQuestion('Turso Database URL')
  const tursoToken = await askQuestion('Turso Auth Token')

  const jwtSecret = await askQuestion('JWT Secret Key', 'supersecretkey_cambiame')
  const saltRounds = await askQuestion('Bcrypt Salt Rounds', '10')
  const jwtExpiration = await askQuestion('JWT Expiration Time', '7d')

  const userEmail = await askQuestion('Email de administración (Gmail)')
  const userPass = await askQuestion('Password de administración')

  const envContent = `
PROJECT_NAME=${projectName}
PORT=${port}
NODE_ENV=${nodeEnv}
FRONTEND_URL=${frontendUrl}
CORS_ORIGINS=${corsOrigins}

TURSO_DATABASE_URL=${tursoUrl}
TURSO_AUTH_TOKEN=${tursoToken}

JWT_SECRET_KEY=${jwtSecret}
SALT_ROUNDS=${saltRounds}
JWT_EXPIRATION_TIME=${jwtExpiration}

ADMIN_EMAIL=${userEmail}
ADMIN_PASSWORD=${userPass}
`.trim()

  const envPath = path.join(__dirname, '..', '.env')
  fs.writeFileSync(envPath, envContent)

  console.log('\n¡Archivo .env generado con éxito!')
  console.log('Recuerda ejecutar "npm install" y luego inicializar la BD con "npm run db:init".')
  rl.close()
}

runInstaller().catch(console.error)
