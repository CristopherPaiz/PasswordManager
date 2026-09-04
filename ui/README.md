# UI — PasswordManager

Frontend del gestor de contraseñas: React 19, TypeScript, Vite y Tailwind v4, mobile-first.

**Aquí ocurre toda la criptografía.** El navegador deriva las llaves, cifra y descifra; al servidor solo salen blobs. Si algún cambio manda un dato en claro, los tests fallan.

---

## Instalación

Requiere Node 22+ y pnpm 10+.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Crea un `.env` apuntando a tu API:

```env
VITE_API_URL=http://localhost:3000
```

Ese valor entra también en la `connect-src` de la Content-Security-Policy que se inyecta en el build, así que en producción tiene que ser el dominio real de la API.

## Scripts

| Script | Qué hace |
|---|---|
| `pnpm dev` | Vite en `http://localhost:5173` |
| `pnpm build` | `tsc -b` + build de producción (con CSP inyectada) |
| `pnpm preview` | Sirve el build localmente |
| `pnpm test` | Vitest + Testing Library (jsdom) |
| `pnpm lint` | ESLint |

---

## El núcleo criptográfico

Cuatro archivos concentran todo lo importante:

| Archivo | Responsabilidad |
|---|---|
| `src/utils/crypto.ts` | Argon2id (hash-wasm), HKDF, AES-256-GCM, envoltura de la llave del baúl, llave de recuperación en base32 |
| `src/utils/vault.ts` | Flujos completos: registro, login, recuperación, cambio de maestra y endurecimiento del KDF |
| `src/utils/manifest.ts` | Inventario cifrado del baúl: detecta elementos borrados, revertidos o inyectados por el servidor |
| `src/utils/webauthn.ts` | Passkeys con la extensión PRF (desbloqueo con huella o Windows Hello) |

La llave del baúl vive **solo en memoria** (`src/store/vault.store.ts`): recargar la página bloquea el baúl aunque la sesión siga viva, y `useAutoLock` la borra tras la inactividad configurada.

---

## Estructura

```
src/
  api/            cliente axios (cookies, interceptores)
  components/
    security/     diagrama de llaves y demostración en vivo
    settings/     cambio de maestra, respaldos, sesiones
    ui/           primitivos: Button, Input, Modal, Table, SearchBar, Skeleton…
    vault/        modal de elemento, códigos TOTP, tarjetas, desbloqueo
  hooks/queries/  useGetQuery / useMutationQuery / usePaginatedQuery (los únicos permitidos)
  i18n/locales/   es.json y en.json, con las mismas claves
  layouts/        RootLayout, ProtectedLayout (sesión), AdminLayout (rol)
  pages/          public/ (Home, Login, Register, Recovery, Security) y protected/ (Vault, Settings, Dashboard, Errors)
  store/          Zustand: auth, ui, settings y vault (la llave, en memoria)
  utils/          crypto, vault, manifest, webauthn, totp, backup, tarjetas, búsqueda, fechas
```

---

## Convenciones

Están en el [CLAUDE.md](../CLAUDE.md) del repositorio y son obligatorias. En resumen:

- **Mobile-first**, y nada puede desbordar horizontalmente (`min-w-0` en los hijos de grid/flex con contenido ancho).
- Todo el fetching pasa por los **tres hooks genéricos**; nada de `axios` ni `useQuery` sueltos.
- Toda mutación declara `invalidateQueryKey` con las queries que quedan obsoletas.
- Ninguna petición deja la UI en blanco: `Skeleton` cuando se conoce la forma, botón con `isLoading` para acciones.
- Alturas siempre en `dvh`, nunca `screen` ni `vh`.
- Solo tokens semánticos de tema (`bg-bg-surface`, `text-text-muted`…), y todo debe verse bien en claro y oscuro.
- Cero texto hardcodeado: todo por `t()` y presente en **ambos** locales.
- Cero `any`.
- Imports por alias (`@components`, `@hooks`, `@utils`, `@apptypes`…), nunca `../../`.
- Fechas mostradas en hora de Guatemala vía `@utils/datetime`.

---

## Tests

```bash
pnpm test
```

Corren con la criptografía real (Argon2id incluido), sin mocks. Los que importan de verdad:

- `pages/public/Login.test.tsx` y `Register.test.tsx`: **ninguna petición contiene la contraseña maestra**; lo que sale es el `authHash`.
- `utils/crypto.test.ts` y `utils/vault.test.ts`: round-trips, envolturas, recuperación y el upgrade del KDF.
- `utils/manifest.test.ts`: simula a un servidor que borra, revierte o inyecta elementos y comprueba que se detecta.
- `pages/public/Security.test.tsx`: la demostración de la página de seguridad **no hace ni una llamada de red** y no muestra la maestra.
- `constants/navigation.test.ts`: el panel de admin no se le ofrece a un usuario normal.
