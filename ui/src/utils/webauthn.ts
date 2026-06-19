import { randomBytes, toBase64, fromBase64 } from "./crypto";

/**
 * Desbloqueo del baúl con huella/passkey vía WebAuthn + extensión PRF.
 *
 * La passkey (gated por biometría del SO) entrega un secreto PRF estable. Con él
 * derivamos una wrapKey que envuelve/desenvuelve la vaultKey. El secreto nunca
 * sale del autenticador salvo como salida PRF, y solo tras verificación de
 * usuario (huella/PIN). El server solo guarda el id de credencial + el blob
 * envuelto; no puede abrirlo.
 *
 * Una passkey por dispositivo: cada autenticador (Windows Hello, Touch ID,
 * teléfono...) genera su propio secreto PRF y envuelve su propia copia.
 *
 * OJO: PRF depende del navegador + SO + autenticador. Windows Hello solo lo
 * soporta en Windows 11 reciente + Chrome/Edge actuales; si no, el navegador
 * ofrece un teléfono (QR). Si no hay PRF, estas funciones lanzan error claro.
 */

// Salt fijo de la app para la evaluación PRF (no es secreto; ata la derivación).
const PRF_SALT = new TextEncoder().encode("password-manager-prf-salt-v1");

const RP_NAME = "PasswordManager";

// Tipos mínimos para PRF (lib.dom no los incluye aún).
interface PrfExtensionResults {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer | Uint8Array } };
}

export const isPasskeySupported = (): boolean =>
  typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";

// ¿Hay un autenticador de plataforma (Touch ID / Windows Hello / Android)?
export const isPlatformAuthenticatorAvailable = async (): Promise<boolean> => {
  if (!isPasskeySupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};

// Etiqueta legible del dispositivo/navegador para distinguir passkeys en la lista.
export const getDeviceLabel = (): string => {
  const ua = navigator.userAgent;
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Mac/i.test(ua)
      ? "macOS"
      : /Android/i.test(ua)
        ? "Android"
        : /iPhone|iPad/i.test(ua)
          ? "iOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Dispositivo";
  const browser = /Edg/i.test(ua)
    ? "Edge"
    : /Chrome/i.test(ua)
      ? "Chrome"
      : /Firefox/i.test(ua)
        ? "Firefox"
        : /Safari/i.test(ua)
          ? "Safari"
          : "Navegador";
  return `${browser} · ${os}`;
};

const extractPrf = (cred: PublicKeyCredential): Uint8Array | null => {
  const ext = cred.getClientExtensionResults() as unknown as PrfExtensionResults;
  const first = ext.prf?.results?.first;
  if (!first) return null;
  return first instanceof Uint8Array ? first : new Uint8Array(first);
};

/**
 * Crea una passkey y obtiene su secreto PRF. Puede pedir biometría una o dos
 * veces (create + get) según el navegador.
 */
export const registerPasskey = async (
  username: string,
): Promise<{ credId: string; prfSecret: Uint8Array }> => {
  if (!isPasskeySupported()) throw new Error("PASSKEY_UNSUPPORTED");

  const created = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: RP_NAME, id: window.location.hostname },
      user: { id: randomBytes(16), name: username, displayName: username },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
        authenticatorAttachment: "platform",
      },
      timeout: 60000,
      extensions: { prf: { eval: { first: PRF_SALT } } } as unknown as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!created) throw new Error("PASSKEY_CANCELLED");

  const credId = toBase64(new Uint8Array(created.rawId));

  // Algunos navegadores entregan el PRF ya en create(); si no, una assertion.
  const fromCreate = extractPrf(created);
  if (fromCreate) return { credId, prfSecret: fromCreate };

  const result = await getPasskeySecret([credId]);
  return { credId, prfSecret: result.prfSecret };
};

/**
 * Pide una assertion y devuelve el secreto PRF + el cred_id que se usó. El
 * navegador elige la passkey disponible en ESTE dispositivo de entre las dadas.
 */
export const getPasskeySecret = async (
  credIds: string[],
): Promise<{ credId: string; prfSecret: Uint8Array }> => {
  if (!isPasskeySupported()) throw new Error("PASSKEY_UNSUPPORTED");

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: window.location.hostname,
      allowCredentials: credIds.map((id) => ({ type: "public-key", id: fromBase64(id) })),
      userVerification: "required",
      timeout: 60000,
      extensions: { prf: { eval: { first: PRF_SALT } } } as unknown as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error("PASSKEY_CANCELLED");

  const prfSecret = extractPrf(assertion);
  if (!prfSecret) throw new Error("PASSKEY_NO_PRF");

  return { credId: toBase64(new Uint8Array(assertion.rawId)), prfSecret };
};
