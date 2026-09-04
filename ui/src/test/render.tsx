import { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { I18nextProvider } from "react-i18next";
import i18n from "@i18n/config";

/**
 * Monta un componente con el mismo contexto que en la app: TanStack Query,
 * router e i18n. Sin esto, cualquier componente que use `t()` o un hook de
 * datos revienta al montarse.
 *
 * El i18n es el REAL (no un mock que devuelve la clave): así los tests buscan
 * por el texto que ve el usuario y detectan si una clave falta en `es.json`.
 */

// Idioma fijo. Sin esto, el detector de i18next mira el `navigator` de jsdom
// (inglés) y los tests buscarían textos en un idioma distinto al de la app.
await i18n.changeLanguage("es");

const crearQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      // Sin reintentos: un test que espera un fallo no debe esperar 3 rondas.
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

interface RenderOptions {
  /** Ruta inicial del router. */
  route?: string;
}

// El tipo de retorno se deja inferido: anotarlo con `RenderResult` obliga a
// fijar la versión de @testing-library/dom que resuelve el paquete, y basta un
// duplicado en el árbol de dependencias para que deje de compilar.
export const renderWithProviders = (ui: ReactElement, { route = "/" }: RenderOptions = {}) => {
  const queryClient = crearQueryClient();

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );

  return { ...render(ui, { wrapper: Wrapper }), queryClient };
};
