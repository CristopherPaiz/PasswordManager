# Guía de Convenciones — Plantilla (API + UI)

Reglas **obligatorias** para cualquier IA o persona que toque este repo. Léelas antes de editar.
Monorepo: `api/` (Express + TypeScript + Turso + Cloudinary) y `ui/` (React 19 + Vite + Tailwind v4 + TanStack Query + Zustand + i18n).

---

> **POR ENCIMA DE TODO: Mobile-first.** Diseña primero para móvil (estilos base sin prefijo) y agrega `sm:`/`md:`/`lg:` para pantallas grandes. Ver Regla 0.

## ✅ Checklist antes de dar por terminado un cambio

- [ ] ¿Está pensado **mobile-first** y no se desborda horizontalmente en móvil? (Regla 0)
- [ ] ¿Usé los **alias** de imports (`@components`, `@hooks`, …) en vez de `../../`? (Regla 10)
- [ ] ¿Usé **solo** los hooks de datos existentes (`useGetQuery` / `useMutationQuery` / `usePaginatedQuery`)? (Regla 1)
- [ ] ¿La mutación declara `invalidateQueryKey` con TODAS las queries que quedan obsoletas? (Regla 2)
- [ ] ¿Cada petición/acción muestra su loading correcto (skeleton / botón / global)? (Regla 3)
- [ ] ¿Toda altura usa `dvh`, nunca `screen` ni `vh`? (Regla 4)
- [ ] ¿El componente usa tokens de tema y se ve bien en claro **y** oscuro con buen contraste? (Regla 5)
- [ ] ¿Cero strings hardcodeados? Todo vía `t()` y agregado a `es.json` **y** `en.json`. (Regla 6)
- [ ] ¿Cero `any`? Todo tipado. (Regla 7)
- [ ] ¿Cambios de BD por `pnpm db:sql` (sin archivos de migración) y reflejados en `init_tables.ts`? (Regla 8)
- [ ] ¿`tsc`, `eslint` y `build` pasan en verde?

---

## 0. Mobile-first (por encima de todo)

Toda pantalla y componente se diseña **primero para móvil**:

- Estilos base = móvil (sin prefijo). Mejora hacia arriba con `sm:` / `md:` / `lg:`.
  ✅ `grid grid-cols-1 md:grid-cols-2` ❌ empezar en desktop y bajar.
- **Nada debe desbordar horizontalmente en móvil.** El síntoma típico es "el navbar se ve cortado": significa que algo es más ancho que la pantalla y aparece scroll horizontal.
- **Gotcha de overflow**: un hijo de `grid`/`flex` con contenido ancho (tabla, `<pre>`, texto largo) NO encoge por defecto (`min-width: auto`) y desborda la página, aunque tenga `overflow-x-auto` dentro. **Solución: añade `min-w-0` al item del grid/flex** (ver `Dashboard` Card de la tabla y `Table`).
- Contenido tabular ancho → envuélvelo en `overflow-x-auto` y dale `min-w-0` al contenedor padre.
- Prueba siempre el ancho ~360px antes de dar por terminado.

---

## 1. Data fetching: hooks únicos, nunca paralelos

Toda petición pasa por los hooks genéricos de `ui/src/hooks/queries/`:

- `useGetQuery<T>()` — lecturas (GET).
- `useMutationQuery<TData, TVars>()` — escrituras (POST/PUT/PATCH/DELETE).
- `usePaginatedQuery<T>()` — listas paginadas (`{ data, pagination }`).

**Prohibido** llamar `axios`, `useQuery` o `useMutation` directo en páginas/componentes. (Única excepción válida: dentro de los propios hooks de `hooks/queries/`, o un wrapper de dominio justificado como `useAuthQuery`, que **envuelve** al genérico por lógica extra de store).

✅ Correcto:
```ts
const { mutateAsync, isPending } = useMutationQuery({
  endpoint: API_ENDPOINTS.AUTH.LOGIN,
  invalidateQueryKey: [API_ENDPOINTS.AUTH.ME],
  messageSuccess: t("login.success"),
});
```

❌ Incorrecto: crear `useLoginMutation`, `useUploadMutation`, etc. (un hook por cosa) o usar `axios.post` suelto.

**Si necesitas más comportamiento**: EXTIENDE el hook genérico con un parámetro **opcional con valor por defecto** que no cambie el comportamiento actual. Nunca rompas las llamadas existentes ni dupliques el hook.

```ts
// Extender así (opcional, default mantiene compatibilidad):
interface UseMutationQueryParams<TVariables> {
  /* ...existentes... */
  onSettledRefetch?: boolean; // nuevo, default undefined → no afecta a nadie
}
```

---

## 2. Invalidación de cache al mutar

`queryKey` = el string del endpoint. Cuando una mutación cambia datos del servidor, **debe** invalidar las queries que leen esos datos vía `invalidateQueryKey`.

Regla práctica: **cada vez que tocas o agregas una mutación, pregúntate "¿qué pantallas leen lo que esto cambia?" y agrega esos endpoints**.

```ts
// Mutación que edita el perfil → invalida la query del perfil
useMutationQuery({
  endpoint: API_ENDPOINTS.USERS.UPDATE,
  method: "put",
  invalidateQueryKey: [API_ENDPOINTS.AUTH.ME, API_ENDPOINTS.USERS.LIST],
});
```

Para acciones que rompen sesión/estado global (logout), además limpia manualmente:
`queryClient.removeQueries({ queryKey: [API_ENDPOINTS.AUTH.ME] })` (ver `Navbar.tsx`).

---

## 3. Estados de carga: siempre visibles, al nivel correcto

Ninguna petición pendiente puede dejar UI en blanco. Elige el nivel:

| Situación | Qué usar |
|---|---|
| Contenido con forma conocida (perfil, listas, tablas, tarjetas) | **`Skeleton`** (opción por defecto, *skeleton-first*) |
| Acción disparada por botón (submit, subir, logout) | **`<Button isLoading />`** (loader en el botón) |
| Arranque de app / gate de ruta / despertar backend | **`GlobalLoader`** o el `Suspense` de ruta (spinner) |

Regla skeleton-first: si el layout del resultado se conoce de antemano → `Skeleton` (reserva el espacio, evita saltos). Spinner solo para carga genérica/indeterminada. Ejemplos vivos: `Dashboard` (perfil + tabla), `Navbar` (chip de usuario), `Table` (filas skeleton).

---

## 4. Altura dinámica (`dvh`) por encima de todo

Siempre unidades dinámicas, **nunca** `screen` ni `vh`:

- `min-h-dvh`, `h-dvh`, `max-h-[90dvh]`, `min-h-[60dvh]`.
- Aplica a layouts, loaders, modales, páginas a pantalla completa.

❌ `min-h-screen`, `h-screen`, `min-h-[70vh]` → ✅ `min-h-dvh`, `h-dvh`, `min-h-[70dvh]`.

---

## 5. Tema claro/oscuro + contraste obligatorio

Usa **solo tokens semánticos** (definidos en `ui/src/index.css`), nunca colores crudos para superficies/texto:

- Fondos: `bg-bg-base`, `bg-bg-surface`
- Texto: `text-text-base`, `text-text-muted`
- Bordes: `border-border-base`
- Marca: `primary-500`, `primary-600`

❌ Nunca `bg-white`, `text-black`, `bg-gray-100` para superficies/tipografía.

Para estados con color (éxito/error/etc.) usa el patrón con variante dark (ver `Badge.tsx`):
```
bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400
```

Todo componente debe verse correcto en **ambos** temas. Verifica contraste: `text-muted` sobre `bg-base` debe seguir legible en claro y oscuro. No bajes opacidades al punto de perder legibilidad.

---

## 6. i18n obligatorio

Cero texto visible hardcodeado. Todo vía `t("clave")` y agregado a **ambos** `ui/src/i18n/locales/es.json` y `en.json` (mismas claves, anidadas por dominio).

Incluye: títulos, labels, botones, toasts, `aria-label`, headers de tabla, placeholders, mensajes de validación.

Validación con mensajes traducidos → schema como **factory que recibe `t`** (ver `ui/src/validators/auth.schema.ts`):
```ts
export const createLoginSchema = (t: TFunction) =>
  z.object({ username: z.string().min(1, t("login.errors.usernameRequired")) });
```

Mensajes de `messageSuccess` / `messageError` de los hooks también traducidos.

---

## 7. Tipado estricto: prohibido `any`

Si no está tipado, no sirve. Reglas:

- Nunca `any` ni `as any`. Si el dato es realmente dinámico, usa `unknown` + estrechamiento.
- Aprovecha los genéricos: `useGetQuery<Perfil>()`, `useMutationQuery<Respuesta, Variables>()`, `usePaginatedQuery<Fila>()`.
- Tipos de formularios desde el schema o interface explícita (`LoginForm`); deriva con `z.infer` cuando aplique.
- Componentes de formulario usan `forwardRef<HTMLInputElement, Props>` (compat con react-hook-form).
- Define respuestas del backend como `interface` en `ui/src/types/` y reúsalas.

---

## 8. Base de datos Turso: sin archivos de migración

**No se crean archivos por cambio de esquema.** El único archivo de esquema es `api/src/database/init_tables.ts` (idempotente, `CREATE TABLE IF NOT EXISTS`) para instalaciones limpias.

Para cambios rápidos (crear tabla, agregar columna, consultar) usa el runner contra Turso:

```bash
# Desde api/
pnpm db:sql "ALTER TABLE Usuarios ADD COLUMN rol TEXT DEFAULT 'user'"
pnpm db:sql "CREATE TABLE Notas (id INTEGER PRIMARY KEY AUTOINCREMENT, texto TEXT NOT NULL)"
pnpm db:sql "SELECT id, username FROM Usuarios LIMIT 5"
```

Usa las credenciales de `.env` (`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`). Acepta varias sentencias separadas por `;`.

Alternativa (si tienes Turso CLI instalado): `turso db shell <db> "<SQL>"`.

**Importante**: cuando agregues una columna o tabla nueva por `db:sql`, **refléjala también en `init_tables.ts`** para que las instalaciones nuevas queden iguales. No crees archivos sueltos de migración.

---

## 9. Convenciones de componentes (resumen)

- Primitivos reutilizables en `ui/src/components/ui/` (Button, Input, Card, Modal, Select, Textarea, Checkbox, Switch, Badge, Avatar, Skeleton, Table, SearchBar, StackTrace). Antes de crear uno nuevo, revisa si ya existe.
- **Búsquedas/filtros de texto: SIEMPRE `SearchBar`**, nunca un input de búsqueda a mano. Ya trae **debounce integrado** (default 400ms) — `onSearch` recibe el valor ya debounced, no en cada tecla. Así no se dispara una petición por carácter.
  ```tsx
  <SearchBar onSearch={(q) => setQuery(q)} />            // debounce 400ms
  <SearchBar onSearch={handleSearch} delay={250} placeholder={t("...")} />
  ```
- Exports **nombrados** (no `export default` en componentes).
- Inputs de formulario: `forwardRef` + prop `error` para el mensaje.
- Modales: usar `Modal` (ya trae scroll-lock, cierre por ESC/click-fuera, focus-trap y `aria`). No reinventar.
- Backend: cada controller envuelve en `try/catch` y pasa errores a `next(error)`; validación de entrada con Zod vía `validate(schema)` en las rutas.

---

## 10. Alias de imports (nada de `../../`)

Usa alias en vez de rutas relativas que suben de carpeta. Regla: **si el import sube (`../`) → usa alias; si es del mismo nivel o baja (`./`) → relativo está bien**.

**UI** (`@components`, `@hooks`, `@pages`, `@layouts`, `@store`, `@constants`, `@api`, `@i18n`, `@validators`, `@routes`, `@apptypes`):
```ts
import { Button } from "@components/ui/Button";
import { useGetQuery } from "@hooks/queries/core.queries";
import { ApiResponse } from "@apptypes";
```
Definidos en `ui/tsconfig.app.json` (`paths`) y resueltos por `vite-tsconfig-paths`. Sin extensión.

**API** (`@config`, `@controllers`, `@middlewares`, `@routes`, `@database`, `@utils`, `@validators`, `@apptypes`):
```ts
import { authMiddleware } from '@middlewares/auth.middleware.js'
import { HTTP_STATUS } from '@config/constants.js'
```
Definidos en `api/tsconfig.json` (`paths`). **Importante (ESM/NodeNext)**: el especificador lleva extensión **`.js`** aunque el archivo sea `.ts` (Node ESM importa el archivo emitido, no el fuente). En dev lo resuelve `tsx`; el build (`tsc && tsc-alias`) reescribe los alias a rutas relativas en `dist/`.

> Nota: el alias del folder de tipos es `@apptypes` (no `@types`), porque `@types/*` choca con la convención de paquetes de DefinitelyTyped y TypeScript lo rechaza.

---

## 11. Fechas y horas: SIEMPRE hora de Guatemala (GMT-6)

Regla de oro: **guarda en UTC, muestra en Guatemala**. Nunca confíes en la hora **local** del navegador ni del servidor de deploy (Render suele estar en UTC). La hora de Guatemala se deriva del instante (epoch/UTC) con `Intl` y zona `America/Guatemala` (offset fijo `-06:00`, sin horario de verano).

- **UI**: usa `@utils/datetime` → `formatGuatemala` / `formatGuatemalaDate` / `formatGuatemalaTime`. Nunca `new Date().toLocaleString()` sin `timeZone`.
- **API**: usa `@utils/datetime.helper` → `formatGuatemala`, `getServerTimeInfo`. Para timestamps en BD, UTC (`CURRENT_TIMESTAMP` / `toISOString()`) y formatea a Guatemala al mostrar.
- **Verificar la hora del servidor**: `GET /api/system/time` devuelve `{ epoch, utc, guatemala, timezone, offset, serverTimezone }`. En UI: hook `useServerTime` + componente `<ServerTime />` (reloj en vivo en hora de Guatemala + desfase con el reloj del cliente).
