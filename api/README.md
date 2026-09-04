# API — PasswordManager

Backend zero-knowledge del gestor de contraseñas: Node.js 22, TypeScript (ESM/NodeNext), Express 4 y Turso (libSQL).

El servidor **guarda** el baúl pero **no puede leerlo**. Todo lo sensible llega ya cifrado desde el navegador. Lo que aquí se recibe es:

- `authHash`: un HKDF de la llave maestra, que además se guarda con bcrypt encima. No permite descifrar nada.
- `wrapped_vault_key`: la llave del baúl envuelta con una llave que nunca sale del navegador.
- `ciphertext` + `iv` por elemento: AES-256-GCM, con el `uid` de la fila como AAD.

El modelo completo está explicado en el [README raíz](../README.md) y en la página `/security` de la app.

---

## Instalación

Requiere Node 22+ y pnpm 10+.

```bash
pnpm install --frozen-lockfile
pnpm setup     # genera el .env de forma interactiva
pnpm db:init   # crea tablas e índices (idempotente)
pnpm dev
```

No se siembra ningún usuario: la primera cuenta se crea desde el registro de la UI, que es donde se generan el salt, la llave del baúl y la llave de recuperación. Un admin insertado a mano no tendría parámetros criptográficos y no podría abrir ningún baúl.

Para dar rol de administrador (solo hace falta para leer `/api/errors`):

```bash
pnpm db:sql "UPDATE Usuarios SET rol = 'admin' WHERE username = 'tu_usuario'"
```

## Scripts

| Script | Qué hace |
|---|---|
| `pnpm dev` | Servidor con recarga (`tsx watch`) |
| `pnpm build` | `tsc` + `tsc-alias` (reescribe los alias a rutas relativas en `dist/`) |
| `pnpm start` | Ejecuta `dist/server.js` |
| `pnpm db:init` | Aplica el esquema completo (tablas + índices) |
| `pnpm db:sql "<SQL>"` | Runner contra Turso; acepta varias sentencias separadas por `;` |
| `pnpm test` | Vitest + Supertest contra SQLite en memoria |
| `pnpm typecheck` | `tsc --noEmit` incluyendo tests |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |

## Variables de entorno

Obligatorias: `PORT`, `NODE_ENV`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET_KEY`, `JWT_EXPIRATION_TIME`, `SALT_ROUNDS`.

Recomendadas: `TOTP_ENC_KEY` (cifra los secretos TOTP en reposo), `FRONTEND_URL` y `CORS_ORIGINS` (allowlist de CORS y de la defensa anti-CSRF por `Origin`).

`validateEnv()` aborta el arranque si falta una obligatoria o si un secreto es peligrosamente corto (menos de 16 caracteres), y advierte por debajo de 32.

---

## Endpoints

Todas las rutas cuelgan de `/api`. Las marcadas con 🔒 exigen cookie de sesión válida; las 👑 además rol `admin`.

### Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/auth/register` | Alta de cuenta. Recibe `authHash`, salt, parámetros KDF y las dos envolturas de la llave del baúl |
| `POST` | `/auth/prelogin` | Devuelve salt y parámetros KDF. Si el usuario no existe responde un salt señuelo determinista (anti-enumeración) |
| `POST` | `/auth/login` | Verifica el `authHash`, exige TOTP si está activo y emite la cookie |
| `POST` | `/auth/logout` | Invalida la sesión en base de datos, no solo la cookie |
| `GET` | `/auth/me` 🔒 | Perfil, rol y qué segundos factores tiene activos |
| `POST` | `/auth/recovery/start` | Entrega la envoltura de recuperación para el flujo de reset |
| `POST` | `/auth/recovery/reset` | Aplica una maestra nueva autorizada por la llave de recuperación, que se rota en el proceso |
| `POST` | `/auth/totp/setup` 🔒 | Genera secreto y QR |
| `POST` | `/auth/totp/enable` 🔒 | Activa el 2FA validando un código |
| `POST` | `/auth/totp/disable` 🔒 | Lo desactiva validando un código |
| `GET` | `/auth/passkeys` 🔒 | Passkeys registradas (solo metadatos) |
| `POST` | `/auth/passkey` 🔒 | Registra una passkey con la llave del baúl envuelta por su secreto PRF |
| `DELETE` | `/auth/passkey/:id` 🔒 | Elimina una passkey |
| `PUT` | `/auth/master` 🔒 | Cambia la contraseña maestra y cierra las demás sesiones |
| `PUT` | `/auth/kdf` 🔒 | Endurece los parámetros de Argon2id **sin** cambiar la maestra ni cerrar sesiones |
| `GET` | `/auth/sessions` 🔒 | Sesiones activas, marcando la actual |
| `DELETE` | `/auth/sessions/:id` 🔒 | Revoca una sesión |

`register`, `prelogin`, `login` y los dos de recuperación pasan por un doble límite de intentos: por IP y **por nombre de cuenta**, para que rotar IPs no sirva para martillar una cuenta concreta.

### Baúl

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/vault/keys` 🔒 | Salt, parámetros KDF y envolturas (incluidas las de passkeys) para reabrir el baúl tras recargar |
| `GET` | `/vault` 🔒 | Elementos cifrados del usuario |
| `POST` | `/vault` 🔒 | Crea un elemento |
| `PUT` | `/vault/:id` 🔒 | Actualiza un elemento |
| `DELETE` | `/vault/:id` 🔒 | Elimina un elemento |
| `POST` | `/vault/bulk` 🔒 | Importación masiva (atómica, hasta 2000 elementos) |
| `GET` | `/vault/manifest` 🔒 | Manifiesto de integridad cifrado y su versión |
| `PUT` | `/vault/manifest` 🔒 | Guarda un manifiesto nuevo; responde 409 si la versión no avanza |

### Otros

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/errors` 🔒👑 | Historial de errores paginado. Solo admin: los stack traces filtran rutas internas y SQL |
| `GET` | `/config` | Configuración pública de la app |
| `GET` | `/system/time` | Hora del servidor en UTC y en Guatemala (GMT-6), para diagnosticar desfases de TOTP |
| `GET` | `/health`, `/ping`, `/status` | Salud del servicio (varias rutas por si un bloqueador corta `/health`) |

---

## Probar con cURL

En PowerShell/CMD de Windows: `-c cookies.txt` guarda la cookie de sesión y `-b cookies.txt` la reenvía.

**Ojo con el registro y el login por cURL:** `password` **no** es la contraseña maestra, es el `authHash` que el navegador deriva de ella. A mano solo puedes crear cuentas de prueba cuyos blobs no abrirá nadie; para una cuenta real usa la UI.

```bash
curl.exe -X POST http://localhost:3000/api/auth/prelogin ^
  -H "Content-Type: application/json" ^
  -d "{\"username\": \"tu_usuario\"}"
```

```bash
curl.exe -X GET http://localhost:3000/api/auth/me -b cookies.txt
```

```bash
curl.exe -X GET http://localhost:3000/api/system/time
```

Fuera de producción hay una ruta que provoca un error 500 a propósito, para comprobar que el middleware lo registra en `ErrorLogs`:

```bash
curl.exe -X GET http://localhost:3000/api/force-error
```

---

## Base de datos

**No hay archivos de migración.** El único archivo de esquema es `src/database/init_tables.ts`: idempotente, con el estado deseado completo, y es el mismo que levantan los tests contra SQLite en memoria (si falta una columna ahí, los tests fallan).

Para un cambio puntual:

```bash
pnpm db:sql "ALTER TABLE Usuarios ADD COLUMN ejemplo TEXT"
```

Y refléjalo también en `init_tables.ts`, para que una instalación nueva quede igual.

Tablas: `Usuarios`, `VaultItems`, `Passkeys`, `Sesiones`, `ErrorLogs`, `Configuraciones`.

---

## Tests

```bash
pnpm test
```

14 suites que corren contra SQLite en memoria con el esquema real, sin tocar Turso ni necesitar credenciales. Cubren, entre otras cosas: que el `authHash` nunca se guarde en claro, que un usuario no pueda leer el baúl ni las passkeys de otro, que un código TOTP no se pueda reusar dentro de su ventana, que el manifiesto no acepte retroceder de versión, que endurecer el KDF no cierre las demás sesiones ni toque la envoltura de recuperación, y que `/api/errors` rechace a quien no es admin.
