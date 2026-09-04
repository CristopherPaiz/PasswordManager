import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Config aparte de `vite.config.ts` a propósito: los tests no necesitan Tailwind
 * ni el plugin de CSP (que solo aplica en build). Sí se reusan
 * `vite-tsconfig-paths` (alias @utils, @apptypes, ...) y el plugin de React,
 * necesario para los tests de componentes con JSX.
 *
 * Dos entornos conviviendo:
 * - `node` por defecto: el núcleo cripto corre contra el WebCrypto real, sin
 *   mockear justo el primitivo que se quiere verificar.
 * - `jsdom` en los archivos que lo piden con `@vitest-environment jsdom` en la
 *   cabecera. Se marca por archivo en vez de por carpeta para que sea evidente
 *   al abrirlo cuál es el entorno.
 *
 * `testTimeout` alto: Argon2id con los parámetros reales tarda cientos de ms por
 * derivación, y algunos tests hacen varias.
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths({ projects: ["tsconfig.app.json"] })],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 30000,
  },
});
