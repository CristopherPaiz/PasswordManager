/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiClient } from "@api/axios.client";
import { API_ENDPOINTS } from "@constants/app.constants";
import { useAuthStore } from "@store/auth.store";
import { useVaultStore } from "@store/vault.store";
import { renderWithProviders } from "../../test/render";
import { Register } from "./Register";

/**
 * El registro es el momento en que nace TODO el material criptográfico: la
 * llave del baúl, la envoltura con la maestra, la envoltura con la llave de
 * recuperación. Si algo se filtrara al servidor sería aquí, y sería definitivo.
 *
 * Estos tests inspeccionan el payload real que sale por el cliente HTTP con el
 * Argon2id y el AES-GCM de verdad — nada mockeado del lado cripto.
 */

const MAESTRA = "clave-maestra-larga-y-fuerte-77";
const USUARIO = "cristopher";
const CORREO = "cristopher@ejemplo.com";

interface LlamadaHttp {
  url: string;
  body: unknown;
}

let llamadas: LlamadaHttp[] = [];

const cuerposEnviados = (): string => JSON.stringify(llamadas);

const llamadaRegistro = (): LlamadaHttp | undefined =>
  llamadas.find((c) => c.url === API_ENDPOINTS.AUTH.REGISTER);

interface PayloadRegistro {
  username: string;
  email: string;
  password: string;
  kdf_salt: string;
  kdf_params: { algo: string; m: number; t: number; p: number; hashLen: number };
  wrapped_vault_key: { iv: string; ct: string };
  wrapped_vault_key_recovery: { iv: string; ct: string };
  recovery_auth: string;
}

const payloadRegistro = (): PayloadRegistro => llamadaRegistro()?.body as PayloadRegistro;

beforeEach(() => {
  llamadas = [];
  vi.restoreAllMocks();
  cleanup();
  useAuthStore.setState({ isAuthenticatedHint: false });
  useVaultStore.getState().lock();

  vi.spyOn(apiClient, "get").mockRejectedValue(new Error("sin sesión"));
  vi.spyOn(apiClient, "post").mockImplementation(async (url: string, body?: unknown) => {
    llamadas.push({ url, body });
    return { data: { message: "ok", user: { id: 1, username: USUARIO } } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
});

const crearCuenta = async (maestra = MAESTRA): Promise<void> => {
  const user = userEvent.setup();
  renderWithProviders(<Register />);

  await user.type(screen.getByLabelText(/^usuario$/i), USUARIO);
  await user.type(screen.getByLabelText(/correo/i), CORREO);
  await user.type(screen.getByLabelText(/^contraseña maestra$/i), maestra);
  await user.type(screen.getByLabelText(/confirmar contraseña maestra/i), maestra);
  await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

  await waitFor(() => expect(llamadaRegistro()).toBeDefined());
};

describe("Register: nada secreto sale del navegador", () => {
  it("el payload no contiene la contraseña maestra", async () => {
    await crearCuenta();

    expect(cuerposEnviados()).not.toContain(MAESTRA);
    expect(cuerposEnviados()).not.toContain("clave-maestra");
  });

  it("manda el authHash derivado en lugar de la maestra", async () => {
    await crearCuenta();
    const payload = payloadRegistro();

    expect(payload.username).toBe(USUARIO);
    expect(payload.email).toBe(CORREO);
    expect(payload.password).not.toBe(MAESTRA);
    expect(payload.password).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });

  // Los parámetros los elige el CLIENTE, pero el servidor impone un piso. Si
  // alguien bajara los valores por defecto, el registro empezaría a fallar en
  // producción; este test lo caza antes.
  it("los parámetros del KDF respetan el piso del servidor", async () => {
    await crearCuenta();
    const { kdf_params, kdf_salt } = payloadRegistro();

    expect(kdf_params.algo).toBe("argon2id");
    expect(kdf_params.m).toBeGreaterThanOrEqual(19456);
    expect(kdf_params.t).toBeGreaterThanOrEqual(2);
    expect(kdf_params.hashLen).toBe(32);
    // Salt de 16 bytes, aleatorio por cuenta.
    expect(Buffer.from(kdf_salt, "base64")).toHaveLength(16);
  });

  it("las dos envolturas de la vaultKey viajan cifradas y son distintas entre sí", async () => {
    await crearCuenta();
    const { wrapped_vault_key, wrapped_vault_key_recovery } = payloadRegistro();

    for (const blob of [wrapped_vault_key, wrapped_vault_key_recovery]) {
      // iv de 12 bytes y ct de 48 (32 de llave + 16 de tag GCM).
      expect(Buffer.from(blob.iv, "base64")).toHaveLength(12);
      expect(Buffer.from(blob.ct, "base64")).toHaveLength(48);
    }

    // Misma vaultKey, envoltura distinta: si coincidieran, una sola llave
    // abriría las dos puertas.
    expect(wrapped_vault_key.ct).not.toBe(wrapped_vault_key_recovery.ct);
  });

  it("la llave de recuperación se muestra al usuario pero nunca se envía", async () => {
    await crearCuenta();

    // Se muestra en pantalla en grupos de 4 caracteres.
    const mostrada = await screen.findByText(/^[A-Z2-7]{4}(-[A-Z2-7]{4})+$/);
    const llave = mostrada.textContent ?? "";
    expect(llave.replace(/-/g, "")).toHaveLength(32);

    // Al server solo va el hash de posesión, jamás la llave.
    expect(cuerposEnviados()).not.toContain(llave);
    expect(cuerposEnviados()).not.toContain(llave.replace(/-/g, ""));
    expect(payloadRegistro().recovery_auth).not.toBe(llave);
  });

  it("cada registro genera salt, llave y envolturas nuevas", async () => {
    await crearCuenta();
    const primero = payloadRegistro();

    llamadas = [];
    cleanup();
    useAuthStore.setState({ isAuthenticatedHint: false });
    await crearCuenta();
    const segundo = payloadRegistro();

    // Misma maestra, material distinto: el salt aleatorio lo garantiza.
    expect(segundo.kdf_salt).not.toBe(primero.kdf_salt);
    expect(segundo.password).not.toBe(primero.password);
    expect(segundo.wrapped_vault_key.ct).not.toBe(primero.wrapped_vault_key.ct);
    expect(segundo.recovery_auth).not.toBe(primero.recovery_auth);
  });
});

describe("Register: validación de la maestra", () => {
  // El servidor NUNCA ve la maestra, así que no puede exigirle fuerza: esta
  // regla solo puede vivir en el cliente. Si se cae, nadie más la sostiene.
  it("rechaza una maestra corta sin llamar al servidor", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Register />);

    await user.type(screen.getByLabelText(/^usuario$/i), USUARIO);
    await user.type(screen.getByLabelText(/correo/i), CORREO);
    await user.type(screen.getByLabelText(/^contraseña maestra$/i), "corta1");
    await user.type(screen.getByLabelText(/confirmar contraseña maestra/i), "corta1");
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await waitFor(() => expect(screen.getByText(/al menos 12 caracteres/i)).toBeInTheDocument());
    expect(llamadas).toHaveLength(0);
  });

  it("rechaza si la confirmación no coincide", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Register />);

    await user.type(screen.getByLabelText(/^usuario$/i), USUARIO);
    await user.type(screen.getByLabelText(/correo/i), CORREO);
    await user.type(screen.getByLabelText(/^contraseña maestra$/i), MAESTRA);
    await user.type(screen.getByLabelText(/confirmar contraseña maestra/i), `${MAESTRA}-otra`);
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await waitFor(() => expect(screen.getByText(/no coinciden/i)).toBeInTheDocument());
    expect(llamadas).toHaveLength(0);
  });
});
