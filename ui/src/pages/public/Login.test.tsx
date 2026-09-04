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
import { Login } from "./Login";

/**
 * La promesa del producto: el servidor NUNCA recibe la contraseña maestra, solo
 * un authHash derivado de ella. Estos tests son la red de seguridad de esa
 * promesa — si alguien "simplifica" el login mandando `values.password` directo,
 * fallan.
 *
 * Nada de criptografía mockeada: corre el Argon2id real (por eso los parámetros
 * bajos, el mínimo que acepta el servidor) y se inspecciona lo que SALE por el
 * cliente HTTP, que es el único punto por donde algo puede escaparse.
 */

const MAESTRA = "esta-es-mi-maestra-secreta-42";
const USUARIO = "cristopher";
// Mínimos aceptados por el schema del backend (OWASP): 19 MiB y 2 pasadas.
// Suficiente para que el test sea real sin tardar segundos por derivación.
const KDF_PARAMS = { algo: "argon2id", m: 19456, t: 2, p: 1, hashLen: 32 };
const SALT = "c2FsdC1kZS1wcnVlYmEtMTIz";

interface LlamadaHttp {
  url: string;
  body: unknown;
}

let llamadas: LlamadaHttp[] = [];

/** Todo lo que el navegador manda al server durante el test. */
const cuerposEnviados = (): string => JSON.stringify(llamadas);

/**
 * Compara la URL EXACTA: "login" también hace match dentro de "prelogin", y
 * confundirlas haría que un test leyera el cuerpo equivocado y pasara sin
 * comprobar nada.
 */
const buscarLlamada = (url: string): LlamadaHttp | undefined =>
  llamadas.find((c) => c.url === url);

const llamadaPrelogin = (): LlamadaHttp | undefined =>
  buscarLlamada(API_ENDPOINTS.AUTH.PRELOGIN);

const llamadaLogin = (): LlamadaHttp | undefined => buscarLlamada(API_ENDPOINTS.AUTH.LOGIN);

/**
 * Los stores de Zustand y el localStorage sobreviven entre tests (son módulos
 * singleton). Sin este reseteo, un login exitoso deja `isAuthenticatedHint` en
 * true y el siguiente render redirige al baúl en vez de mostrar el formulario.
 */
const resetEstado = (): void => {
  cleanup();
  // Basta con el estado en memoria: `persist` solo lee el almacenamiento al
  // hidratar el módulo, no en cada render.
  useAuthStore.setState({ isAuthenticatedHint: false });
  useVaultStore.getState().lock();
};

beforeEach(() => {
  llamadas = [];
  vi.restoreAllMocks();
  resetEstado();

  // `/auth/me` no debe salir a la red aunque algo deje el hint en true.
  vi.spyOn(apiClient, "get").mockRejectedValue(new Error("sin sesión"));

  // Se intercepta el cliente axios compartido: cualquier petición de la app
  // pasa por aquí, así que nada puede salir sin quedar registrado.
  vi.spyOn(apiClient, "post").mockImplementation(async (url: string, body?: unknown) => {
    llamadas.push({ url, body });

    if (url.includes("prelogin")) {
      return { data: { kdf_salt: SALT, kdf_params: KDF_PARAMS } };
    }
    return { data: { message: "ok", user: { id: 1, username: USUARIO }, wrapped_vault_key: null } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
});

const iniciarSesion = async (maestra = MAESTRA): Promise<void> => {
  // Permite llamarlo dos veces en el mismo test (comparar authHashes) sin que
  // queden dos formularios montados a la vez.
  resetEstado();
  const user = userEvent.setup();
  renderWithProviders(<Login />);

  await user.type(screen.getByLabelText(/usuario/i), USUARIO);
  await user.type(screen.getByLabelText(/contraseña maestra/i), maestra);
  await user.click(screen.getByRole("button", { name: /ingresar/i }));

  await waitFor(() => expect(llamadaLogin()).toBeDefined());
};

describe("Login: la maestra nunca sale del navegador", () => {
  it("ninguna petición contiene la contraseña maestra", async () => {
    await iniciarSesion();

    expect(cuerposEnviados()).not.toContain(MAESTRA);
    // Ni siquiera un pedazo suficientemente largo para ser reconocible.
    expect(cuerposEnviados()).not.toContain("maestra-secreta");
  });

  it("el prelogin solo manda el username", async () => {
    await iniciarSesion();

    expect(llamadaPrelogin()?.body).toEqual({ username: USUARIO });
  });

  it("el login manda un authHash derivado, no la maestra", async () => {
    await iniciarSesion();

    const body = llamadaLogin()?.body as { username: string; password: string };

    expect(body.username).toBe(USUARIO);
    expect(body.password).not.toBe(MAESTRA);
    // 32 bytes en base64: la salida de HKDF sobre la llave maestra.
    expect(body.password).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });

  it("el authHash es determinista para la misma maestra y el mismo salt", async () => {
    await iniciarSesion();
    const primero = (llamadaLogin()?.body as { password: string }).password;

    llamadas = [];
    await iniciarSesion();
    const segundo = (llamadaLogin()?.body as { password: string }).password;

    expect(segundo).toBe(primero);
  });

  it("una maestra distinta produce un authHash distinto", async () => {
    await iniciarSesion();
    const conMaestraReal = (llamadaLogin()?.body as { password: string }).password;

    llamadas = [];
    await iniciarSesion("otra-maestra-completamente-distinta");
    const conOtraMaestra = (llamadaLogin()?.body as { password: string }).password;

    expect(conOtraMaestra).not.toBe(conMaestraReal);
  });

  // Si el salt no entrara en la derivación, el mismo authHash valdría en
  // cualquier cuenta y una tabla precalculada rompería todos los baúles.
  it("el salt entra en la derivación: otro salt, otro authHash", async () => {
    await iniciarSesion();
    const conSaltOriginal = (llamadaLogin()?.body as { password: string }).password;

    llamadas = [];
    vi.spyOn(apiClient, "post").mockImplementation(async (url: string, body?: unknown) => {
      llamadas.push({ url, body });
      if (url.includes("prelogin")) {
        return { data: { kdf_salt: "b3Ryby1zYWx0LWRpc3RpbnRvLTk5", kdf_params: KDF_PARAMS } };
      }
      return { data: { message: "ok", wrapped_vault_key: null } };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    await iniciarSesion();
    const conOtroSalt = (llamadaLogin()?.body as { password: string }).password;

    expect(conOtroSalt).not.toBe(conSaltOriginal);
  });
});

describe("Login: validación y errores", () => {
  it("no manda nada si faltan las credenciales", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />);

    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    await waitFor(() => expect(screen.getByText(/usuario es obligatorio/i)).toBeInTheDocument());
    expect(llamadas).toHaveLength(0);
  });

  it("muestra credenciales inválidas cuando el server rechaza", async () => {
    vi.spyOn(apiClient, "post").mockImplementation(async (url: string, body?: unknown) => {
      llamadas.push({ url, body });
      if (url.includes("prelogin")) {
        return { data: { kdf_salt: SALT, kdf_params: KDF_PARAMS } };
      }
      throw new Error("Usuario o contraseña incorrectos.");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const user = userEvent.setup();
    renderWithProviders(<Login />);
    await user.type(screen.getByLabelText(/usuario/i), USUARIO);
    await user.type(screen.getByLabelText(/contraseña maestra/i), MAESTRA);
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    await waitFor(() =>
      expect(screen.getByText(/incorrectos/i)).toBeInTheDocument(),
    );
    // Y el fallo tampoco filtra la maestra en el intento.
    expect(cuerposEnviados()).not.toContain(MAESTRA);
  });

  it("pide el código 2FA sin volver a pedir la maestra", async () => {
    vi.spyOn(apiClient, "post").mockImplementation(async (url: string, body?: unknown) => {
      llamadas.push({ url, body });
      if (url.includes("prelogin")) {
        return { data: { kdf_salt: SALT, kdf_params: KDF_PARAMS } };
      }
      return { data: { totpRequired: true } };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const user = userEvent.setup();
    renderWithProviders(<Login />);
    await user.type(screen.getByLabelText(/usuario/i), USUARIO);
    await user.type(screen.getByLabelText(/contraseña maestra/i), MAESTRA);
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    // El paso 2FA reusa el authHash ya derivado: la maestra no vuelve a
    // aparecer en pantalla ni, por tanto, en memoria del formulario.
    await waitFor(() => expect(screen.getByLabelText(/código de 6 dígitos/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/contraseña maestra/i)).not.toBeInTheDocument();
    expect(cuerposEnviados()).not.toContain(MAESTRA);
  });
});
