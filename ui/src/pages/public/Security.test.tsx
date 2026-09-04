/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiClient } from "@api/axios.client";
import { useAuthStore } from "@store/auth.store";
import { renderWithProviders } from "../../test/render";
import { Security } from "./Security";

/**
 * La página de seguridad promete algo fuerte: "esto se calcula en tu navegador
 * y no se envía a ningún lado". Si la demostración empezara a hablar con el
 * servidor, la página pasaría de explicar la seguridad a romperla.
 *
 * Estos tests corren la criptografía REAL (Argon2id con los parámetros de
 * producción, por eso los timeouts largos) y vigilan justo eso: que nada salga
 * y que lo mostrado como "cifrado" no traiga el dato en claro.
 */

const MAESTRA = "maestra-de-prueba-para-la-demo";
const SECRETO = "mi-secreto-irrepetible-9182";

const LARGO = 30000;

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticatedHint: false });

  // Cualquier petición de la app pasa por este cliente: espiarlo es la forma
  // de comprobar que la demo no llama a nadie.
  vi.spyOn(apiClient, "get").mockRejectedValue(new Error("sin red en el test"));
  vi.spyOn(apiClient, "post").mockRejectedValue(new Error("sin red en el test"));
  vi.spyOn(apiClient, "put").mockRejectedValue(new Error("sin red en el test"));
});

const correrDemo = async (): Promise<void> => {
  const user = userEvent.setup();
  renderWithProviders(<Security />);

  await user.clear(screen.getByLabelText(/dato a guardar/i));
  await user.type(screen.getByLabelText(/contraseña maestra/i), MAESTRA);
  await user.type(screen.getByLabelText(/dato a guardar/i), SECRETO);
  await user.click(screen.getByRole("button", { name: /derivar y cifrar/i }));

  await waitFor(() => expect(screen.getByText(/authHash \(base64\)/i)).toBeInTheDocument(), {
    timeout: LARGO,
  });
};

// Texto del bloque que representa la fila guardada en la base de datos.
const filaGuardada = (): string =>
  screen.getByText(/fila en vaultitems/i).parentElement?.textContent ?? "";

describe("Página de seguridad: la demostración no filtra nada", () => {
  it(
    "no hace ninguna petición al servidor",
    async () => {
      await correrDemo();

      expect(apiClient.post).not.toHaveBeenCalled();
      expect(apiClient.put).not.toHaveBeenCalled();
    },
    LARGO,
  );

  it(
    "lo que muestra como enviable no contiene la maestra",
    async () => {
      await correrDemo();

      expect(document.body.textContent).not.toContain(MAESTRA);
      expect(document.body.textContent).not.toContain("maestra-de-prueba");
    },
    LARGO,
  );

  it(
    "la fila cifrada no contiene el dato en claro",
    async () => {
      await correrDemo();

      const fila = filaGuardada();
      expect(fila).toContain("ciphertext:");
      expect(fila).not.toContain(SECRETO);
    },
    LARGO,
  );

  // Sin esto la demo no probaría nada: hay que ver que la llave SÍ lo recupera.
  it(
    "el descifrado en el navegador sí devuelve el dato",
    async () => {
      await correrDemo();

      expect(screen.getByText(new RegExp(SECRETO))).toBeInTheDocument();
    },
    LARGO,
  );

  it(
    "alterar un byte del cifrado rompe el descifrado",
    async () => {
      const user = userEvent.setup();
      await correrDemo();

      await user.click(screen.getByRole("button", { name: /alterar un byte/i }));

      await waitFor(() =>
        expect(screen.getByText(/descifrado rechazado/i)).toBeInTheDocument(),
      );
    },
    LARGO,
  );
});

describe("Página de seguridad: contenido", () => {
  // La sección de límites es la que hace creíble al resto. Si alguien la borra
  // por quedar mejor, este test lo dice.
  it("dice también lo que NO cubre", () => {
    renderWithProviders(<Security />);

    expect(screen.getByText(/los límites, sin adornos/i)).toBeInTheDocument();
    expect(screen.getByText(/un xss en el front sí sería grave/i)).toBeInTheDocument();
    expect(screen.getByText(/una maestra débil sigue siendo débil/i)).toBeInTheDocument();
  });

  it("explica qué pasa si se pierden la maestra y la llave de recuperación", () => {
    renderWithProviders(<Security />);

    expect(screen.getByText(/pierdes las dos/i)).toBeInTheDocument();
  });
});
