/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../test/render";
import { TotpCode } from "./TotpCode";
import type { VaultItemData } from "@apptypes";

/**
 * El componente calcula el código con el reloj real, así que los tests fijan la
 * hora con temporizadores falsos: sin eso, un test que arranque en el segundo 29
 * de un paso vería el código cambiar a mitad de la comprobación.
 *
 * El secreto y el código esperado salen del RFC 6238 (los mismos vectores que
 * verifica `utils/totp.test.ts`), así que aquí se comprueba el CABLEADO del
 * componente, no la criptografía otra vez.
 */

const SECRETO_RFC = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
// t = 59s con el secreto del RFC: código de 8 dígitos 94287082 → 6 dígitos.
const EPOCH_59S = 59_000;
const CODIGO_EN_59S = "287 082";

const itemBase: VaultItemData = {
  title: "GitHub",
  username: "ana",
  password: "",
  url: "",
  notes: "",
  totp: SECRETO_RFC,
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(EPOCH_59S);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TotpCode", () => {
  it("muestra el código del momento actual, agrupado", async () => {
    renderWithProviders(<TotpCode data={itemBase} onCopy={vi.fn()} />);

    expect(await screen.findByText(CODIGO_EN_59S)).toBeInTheDocument();
  });

  it("no renderiza nada si el item no tiene 2FA", () => {
    const { container } = renderWithProviders(
      <TotpCode data={{ ...itemBase, totp: undefined }} onCopy={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("muestra los segundos que le quedan al código", async () => {
    renderWithProviders(<TotpCode data={itemBase} onCopy={vi.fn()} />);

    // En t=59s del paso de 30s quedan 1s: el borde exacto del cambio.
    expect(await screen.findByRole("timer")).toHaveTextContent("1");
  });

  it("recalcula el código al cruzar al paso siguiente", async () => {
    renderWithProviders(<TotpCode data={itemBase} onCopy={vi.fn()} />);
    expect(await screen.findByText(CODIGO_EN_59S)).toBeInTheDocument();

    await act(async () => {
      vi.setSystemTime(60_000);
      await vi.advanceTimersByTimeAsync(1000);
    });

    await waitFor(() => expect(screen.queryByText(CODIGO_EN_59S)).not.toBeInTheDocument());
    expect(screen.getByRole("timer")).toHaveTextContent("30");
  });

  it("copia el código sin los espacios de presentación", async () => {
    const onCopy = vi.fn();
    renderWithProviders(<TotpCode data={itemBase} onCopy={onCopy} />);
    await screen.findByText(CODIGO_EN_59S);

    await act(async () => {
      screen.getByRole("button", { name: /copiar código 2fa/i }).click();
    });

    // Lo que se copia es lo que se teclea en el servicio: sin espacio.
    expect(onCopy).toHaveBeenCalledWith("287082", expect.stringContaining("2FA"));
  });

  it("respeta dígitos y periodo personalizados", async () => {
    renderWithProviders(
      <TotpCode
        data={{ ...itemBase, totpDigits: 8, totpPeriod: 60 }}
        onCopy={vi.fn()}
      />,
    );

    // 8 dígitos se agrupan 4+4, y en t=59s de un paso de 60s queda 1s.
    expect(await screen.findByText(/^\d{4} \d{4}$/)).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("1");
  });

  // Un blob manipulado o un item guardado por una versión con bug no debe
  // mostrar un código inventado que el servicio va a rechazar.
  it("avisa si el secreto guardado no es válido", async () => {
    renderWithProviders(
      <TotpCode data={{ ...itemBase, totp: "no-es-base32-!!" }} onCopy={vi.fn()} />,
    );

    expect(await screen.findByText(/no es válido/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copiar código 2fa/i })).not.toBeInTheDocument();
  });
});
