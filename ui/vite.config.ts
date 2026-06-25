import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Inyecta una Content-Security-Policy en el build de producción.
 *
 * Para un gestor de contraseñas web, un XSS = robo de la llave del baúl desde la
 * memoria del navegador. La CSP es la defensa principal: limita de dónde puede
 * cargar/ejecutar código la página.
 *
 * Notas clave:
 * - `'wasm-unsafe-eval'` en script-src es OBLIGATORIO: Argon2id (hash-wasm) usa
 *   WebAssembly; sin esto el registro/login se rompen.
 * - `connect-src` incluye el origen del API (VITE_API_URL) para que las peticiones
 *   no queden bloqueadas.
 * - `style-src 'unsafe-inline'`: Tailwind/React inyectan estilos inline (bajo
 *   riesgo comparado con scripts).
 * - `img-src data:`: los QR del 2FA llegan como data URLs.
 * - Solo se aplica en build (`apply: "build"`) para no bloquear el WebSocket de
 *   HMR en desarrollo.
 */
const cspPlugin = (apiUrl: string): Plugin => {
  let apiOrigin = "";
  try {
    apiOrigin = apiUrl ? new URL(apiUrl).origin : "";
  } catch {
    apiOrigin = apiUrl;
  }

  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""}`,
    "form-action 'self'",
  ].join("; ");

  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml(html) {
      const meta = `    <meta http-equiv="Content-Security-Policy" content="${policy}" />\n`;
      return html.replace("</head>", `${meta}  </head>`);
    },
  };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      tailwindcss(),
      tsconfigPaths({ projects: ["tsconfig.app.json"] }),
      cspPlugin(env.VITE_API_URL ?? ""),
    ],
    server: {
      port: 5173,
    },
  };
});
