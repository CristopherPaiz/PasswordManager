# API del gestor de contraseñas (Express + Turso)

Backend zero-knowledge del gestor de contraseñas: Node.js, TypeScript y base de datos Turso (SQLite). El servidor solo guarda blobs cifrados en el navegador; nunca ve la contraseña maestra ni el contenido del baúl.

## 🚀 Instalación desde Cero

1. **Instalar dependencias:**

   ```bash
   npm install
   ```

2. **Configurar el entorno y variables (.env):**

   ```bash
   npm run setup
   ```

   _(Sigue las instrucciones en consola para ingresar tus credenciales de Turso, el secreto JWT, etc.)_

3. **Inicializar la Base de Datos (Crear tablas y usuario admin):**

   ```bash
   npm run db:init
   ```

4. **Iniciar el servidor en modo desarrollo:**
   ```bash
   npm run dev
   ```

---

## 🧪 Guía de Pruebas (Endpoints)

Puedes probar estos endpoints usando **Postman** (recomendado para la subida de imágenes) o directamente en tu **PowerShell / CMD** de Windows usando `curl.exe`.

**Nota importante para cURL en Windows:** Usamos `-c cookies.txt` en el login para guardar la cookie de sesión, y `-b cookies.txt` en las demás peticiones para enviarla y simular que estamos autenticados.

### 1. Registrar un Usuario Nuevo (NO USAR PORQUE EL SCRIPT DE BD HACE UN INSERT DE UN USER)

**Método:** `POST` | **Ruta:** `/api/auth/register`

```bash
curl.exe -X POST http://localhost:3000/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"username\": \"juanperez\", \"password\": \"123456\", \"email\": \"ejemplo@ejemplo.com\", \"nombre\": \"Juan\", \"apellido\": \"Perez\"}"
```

### 2. Iniciar Sesión (Login)

**Método:** `POST` | **Ruta:** `/api/auth/login`
_(Genera la cookie de sesión y la guarda en `cookies.txt`)_

```bash
curl.exe -X POST http://localhost:3000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -c cookies.txt ^
  -d "{\"username\": \"admin\", \"password\": \"admin\"}"
```

### 3. Obtener Perfil (Ruta Protegida)

**Método:** `GET` | **Ruta:** `/api/auth/me`
_(Requiere haber hecho Login previamente para usar `cookies.txt`)_

```bash
curl.exe -X GET http://localhost:3000/api/auth/me ^
  -b cookies.txt
```

### 4. Cerrar Sesión (Logout)

**Método:** `POST` | **Ruta:** `/api/auth/logout`

```bash
curl.exe -X POST http://localhost:3000/api/auth/logout ^
  -b cookies.txt
```

### 5. Simular un Error del Servidor (Prueba de ErrorLogs)

**Método:** `GET` | **Ruta:** `/api/force-error`
_(Genera un error 500 intencional para verificar que se guarde en la tabla ErrorLogs de Turso)_

```bash
curl.exe -X GET http://localhost:3000/api/force-error
```
