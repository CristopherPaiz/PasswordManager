# Frontend Dashboard UI

Plantilla frontend moderna y escalable, diseñada con un enfoque Mobile First y arquitectura limpia.

## 🚀 Tecnologías Principales

- **Core:** React 19, TypeScript, Vite
- **Estilos:** Tailwind CSS v4
- **Enrutamiento:** React Router v7
- **Estado del Servidor:** TanStack Query v5
- **Estado Local:** Zustand (con persistencia)
- **Iconos:** Lucide React
- **Notificaciones:** Sonner

## ✨ Características Implementadas

- ✅ **Autenticación Segura:** Flujo de login interactuando con cookies `httpOnly` y validación de estado persistente (`auth_hint`) para evitar renders innecesarios.
- ✅ **Tema Dinámico:** Soporte nativo para modo Claro/Oscuro estandarizado con variables CSS semánticas.
- ✅ **Global Loader:** Sistema de espera activa que verifica el estado del backend (`/health`) antes de renderizar la aplicación para evitar errores por hibernación del servidor.
- ✅ **Componentes UI Base:** Sistema de diseño propio con componentes reutilizables (`Button`, `Input`, `Card`).
- ✅ **Subida de Archivos:** Integración nativa con el backend para la subida de imágenes mediante `FormData`.

## 🛠️ Instalación y Configuración

### 1. Instalar Dependencias

Asegúrate de tener [Node.js](https://nodejs.org/) instalado. Ejecuta el siguiente comando en la raíz del proyecto para descargar todas las dependencias:

```bash
npm install
```

### 2. Variables de Entorno

No es estrictamente necesario crear un archivo `.env` ya que la URL base está centralizada en `src/constants/app.constants.tsx`. Sin embargo, si deseas utilizar variables de entorno para distintos ambientes, crea un archivo `.env` en la raíz:

```env
VITE_API_URL=http://localhost:3000
```

_(Y asegúrate de actualizar `app.constants.tsx` para que lea `import.meta.env.VITE_API_URL`)_.

### 3. Scripts Disponibles

Arranca el servidor de desarrollo (por defecto en `http://localhost:5173`):

```bash
npm run dev
```

Compila la aplicación para producción con tipado estricto:

```bash
npm run build
```

Ejecuta el linter (ESLint) para revisar errores de código:

```bash
npm run lint
```

Previsualiza la build de producción localmente:

```bash
npm run preview
```

## 📂 Estructura Principal de Carpetas

- `/src/api` - Configuración del cliente Axios con interceptores para el manejo de credenciales y `FormData`.
- `/src/components` - Componentes globales (`Navbar`, `GlobalLoader`) y UI base estructurada (`/ui`).
- `/src/constants` - Diccionarios de rutas, endpoints, navegación, temas y configuraciones estáticas.
- `/src/hooks/queries` - Wrappers de TanStack Query (`useGetQuery`, `useMutationQuery`) y hooks específicos de dominio.
- `/src/layouts` - Plantillas de diseño principales envolventes (`RootLayout`).
- `/src/pages` - Vistas principales de la aplicación (`Home`, `Login`, `Dashboard`).
- `/src/store` - Gestores de estado global reactivo con Zustand (`ui.store`, `auth.store`).
- `/src/types` - Interfaces y tipos globales compartidos.
