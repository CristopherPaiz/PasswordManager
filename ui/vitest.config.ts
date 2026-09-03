import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Config aparte de `vite.config.ts` a propósito: los tests no necesitan React,
 * Tailwind ni el plugin de CSP (que solo aplica en build). Solo se reusa
 * `vite-tsconfig-paths` para resolver los alias (@utils, @apptypes, ...).
 *
 * `environment: "node"`: el núcleo cripto usa WebCrypto (`crypto.subtle`),
 * `btoa`/`atob` y `crypto.randomUUID`, todos globales en Node >= 20. No hace
 * falta jsdom — y así los tests corren contra la implementación real de
 * WebCrypto, sin mockear el primitivo que justamente queremos verificar.
 *
 * `testTimeout` alto: Argon2id con los parámetros por defecto (64 MiB, t=3)
 * tarda cientos de ms por derivación, y algunos tests hacen varias.
 */
export default defineConfig({
  plugins: [tsconfigPaths({ projects: ["tsconfig.app.json"] })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30000,
  },
});
