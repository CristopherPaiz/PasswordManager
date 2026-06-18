# Backend Template TS (Express + Turso + Cloudinary)

Plantilla base para proyectos Backend utilizando Node.js, TypeScript, base de datos Turso (SQLite) y Cloudinary para manejo de imágenes.

## 🚀 Instalación desde Cero

1. **Instalar dependencias:**

   ```bash
   npm install
   ```

2. **Configurar el entorno y variables (.env):**

   ```bash
   npm run setup
   ```

   _(Sigue las instrucciones en consola para ingresar tus credenciales de Turso, Cloudinary, etc.)_

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

### 4. Subir Imagen de Prueba (Ruta Protegida)

**Método:** `POST` | **Ruta:** `/api/upload/test`
_(Asegúrate de tener una imagen llamada `foto.jpg` en la misma carpeta donde ejecutas este comando)_

```bash
curl.exe -X POST http://localhost:3000/api/upload/test ^
  -b cookies.txt ^
  -F "imagen_prueba=@foto.jpg"
```

_En Postman:_ Ve a Body -> Form-Data -> Key: `imagen_prueba` (cámbialo a tipo File) -> Value: Selecciona un archivo.

### 5. Cerrar Sesión (Logout)

**Método:** `POST` | **Ruta:** `/api/auth/logout`

```bash
curl.exe -X POST http://localhost:3000/api/auth/logout ^
  -b cookies.txt
```

### 6. Simular un Error del Servidor (Prueba de ErrorLogs)

**Método:** `GET` | **Ruta:** `/api/force-error`
_(Genera un error 500 intencional para verificar que se guarde en la tabla ErrorLogs de Turso)_

```bash
curl.exe -X GET http://localhost:3000/api/force-error
```
