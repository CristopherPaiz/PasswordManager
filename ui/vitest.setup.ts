import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { webcrypto } from "node:crypto";

/**
 * Preparación común de los tests de componentes.
 *
 * jsdom no implementa `crypto.subtle`, y aquí la criptografía NO se mockea: los
 * tests que verifican que la contraseña maestra jamás sale del navegador tienen
 * que ejercitar el Argon2id y el AES-GCM de verdad. Se inyecta el WebCrypto de
 * Node, que es la misma implementación estándar que usa el navegador.
 */
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

/**
 * jsdom, tal como lo expone Vitest en este entorno, deja `localStorage` como un
 * objeto pelado sin los métodos de `Storage`. Zustand `persist` y el detector de
 * idioma de i18next escriben ahí, así que sin esto cualquier `setState` de un
 * store persistido revienta con "storage.setItem is not a function".
 *
 * Es un `Storage` en memoria, lo justo para que la app se comporte como en el
 * navegador. Se reinstala en cada archivo de test, así que no se filtra estado
 * de uno a otro.
 */
if (typeof globalThis.localStorage?.setItem !== "function") {
  const datos = new Map<string, string>();
  const memoria: Storage = {
    get length() {
      return datos.size;
    },
    key: (index) => [...datos.keys()][index] ?? null,
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => void datos.set(clave, String(valor)),
    removeItem: (clave) => void datos.delete(clave),
    clear: () => datos.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: memoria,
    configurable: true,
    writable: true,
  });
}

expect.extend(matchers);

// Sin `globals: true`, RTL no limpia sola entre tests: un componente montado se
// quedaría en el DOM y el siguiente `getByRole` encontraría dos coincidencias.
afterEach(() => {
  cleanup();
});
