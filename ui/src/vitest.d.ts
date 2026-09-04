/**
 * Matchers de `@testing-library/jest-dom` (toBeInTheDocument, toHaveTextContent,
 * ...) para el `expect` de Vitest. En tiempo de ejecución los registra
 * `vitest.setup.ts`; este archivo solo aporta las declaraciones de tipo, que
 * `tsc` no puede deducir de la llamada a `expect.extend`.
 */
import "@testing-library/jest-dom/vitest";
