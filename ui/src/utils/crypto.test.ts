import { describe, expect, it } from "vitest";
import {
  DEFAULT_KDF_PARAMS,
  KdfParams,
  aesDecrypt,
  aesEncrypt,
  deriveAuthHash,
  deriveMasterKey,
  deriveRecoveryAuth,
  deriveWrapKeyBytes,
  fromBase64,
  generateRecoveryKey,
  generateVaultKey,
  importAesKey,
  randomBytes,
  recoveryKeyToBytes,
  toBase64,
  unwrapVaultKey,
  wrapVaultKey,
} from "./crypto";

/**
 * Tests del núcleo cripto. Corren contra la WebCrypto real de Node: nada de
 * mocks, porque el primitivo ES lo que estamos verificando.
 *
 * Parámetros Argon2id reducidos (8 KiB, 1 pasada) SOLO para que la suite corra
 * rápido. Los de producción (`DEFAULT_KDF_PARAMS`) se verifican aparte.
 */
const FAST_KDF: KdfParams = { algo: "argon2id", m: 8, t: 1, p: 1, hashLen: 32 };

const ZERO_SALT = toBase64(new Uint8Array(16));

// masterKey de juguete, reusada por los tests de HKDF.
const testMasterKey = () =>
  deriveMasterKey("correct horse battery staple", ZERO_SALT, FAST_KDF);

describe("base64", () => {
  it("hace round-trip de bytes arbitrarios, incluidos 0x00 y 0xFF", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 254, 255, 0, 0]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("hace round-trip de 256 bytes aleatorios", () => {
    const bytes = randomBytes(256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("coincide con la codificación estándar", () => {
    expect(toBase64(new TextEncoder().encode("hola"))).toBe("aG9sYQ==");
  });
});

describe("llave de recuperación (base32)", () => {
  it("genera 20 bytes mostrados como 8 grupos de 4 caracteres", () => {
    const { display, bytes } = generateRecoveryKey();
    expect(bytes).toHaveLength(20);
    // 160 bits / 5 = 32 chars exactos, sin relleno perdido.
    expect(display.replace(/-/g, "")).toHaveLength(32);
    expect(display.split("-")).toHaveLength(8);
    expect(display).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){7}$/);
  });

  it("hace round-trip display -> bytes sin perder el último byte", () => {
    // El último grupo de 5 bits es justo donde un base32 mal implementado
    // pierde o inventa un byte. 50 llaves aleatorias cubren ese borde.
    for (let i = 0; i < 50; i++) {
      const { display, bytes } = generateRecoveryKey();
      expect(recoveryKeyToBytes(display)).toEqual(bytes);
    }
  });

  it("tolera minúsculas, guiones faltantes y espacios al teclear la llave", () => {
    const { display, bytes } = generateRecoveryKey();
    const raw = display.replace(/-/g, "");
    expect(recoveryKeyToBytes(display.toLowerCase())).toEqual(bytes);
    expect(recoveryKeyToBytes(raw)).toEqual(bytes);
    expect(recoveryKeyToBytes(raw.match(/.{1,4}/g)!.join(" "))).toEqual(bytes);
  });

  it("genera llaves distintas en cada invocación", () => {
    expect(generateRecoveryKey().display).not.toBe(
      generateRecoveryKey().display,
    );
  });
});

describe("deriveMasterKey (Argon2id)", () => {
  it("es determinista: misma maestra + mismo salt = mismos bytes", async () => {
    const a = await deriveMasterKey("entrada-de-prueba-a", ZERO_SALT, FAST_KDF);
    const b = await deriveMasterKey("entrada-de-prueba-a", ZERO_SALT, FAST_KDF);
    expect(a).toEqual(b);
  });

  it("cambia con el salt (dos cuentas con la misma maestra no colisionan)", async () => {
    const a = await deriveMasterKey("entrada-de-prueba-a", ZERO_SALT, FAST_KDF);
    const b = await deriveMasterKey(
      "entrada-de-prueba-a",
      toBase64(randomBytes(16)),
      FAST_KDF,
    );
    expect(a).not.toEqual(b);
  });

  it("cambia con la contraseña", async () => {
    const a = await deriveMasterKey("entrada-de-prueba-a", ZERO_SALT, FAST_KDF);
    const b = await deriveMasterKey("entrada-de-prueba-b", ZERO_SALT, FAST_KDF);
    expect(a).not.toEqual(b);
  });

  it("respeta hashLen", async () => {
    const k = await deriveMasterKey("entrada-de-prueba-a", ZERO_SALT, {
      ...FAST_KDF,
      hashLen: 64,
    });
    expect(k).toHaveLength(64);
  });

  it("los parámetros de producción producen 32 bytes y cumplen el piso OWASP", async () => {
    const k = await deriveMasterKey(
      "entrada-de-prueba-a",
      ZERO_SALT,
      DEFAULT_KDF_PARAMS,
    );
    expect(k).toHaveLength(32);
    expect(DEFAULT_KDF_PARAMS.m).toBeGreaterThanOrEqual(19456); // 19 MiB
    expect(DEFAULT_KDF_PARAMS.t).toBeGreaterThanOrEqual(2);
  });

  /**
   * VECTOR FIJO. Si este test se rompe, la derivación cambió y TODAS las
   * cuentas existentes quedan fuera: el authHash ya no coincidirá con el
   * bcrypt guardado y la wrapKey ya no abrirá la vaultKey.
   * Romperlo a propósito exige un plan de migración, no editar el vector.
   */
  it("vector conocido: la derivación no ha cambiado", async () => {
    const k = await deriveMasterKey(
      "correct horse battery staple",
      ZERO_SALT,
      FAST_KDF,
    );
    expect(toBase64(k)).toBe("yuD2H5PR1k40noDgIpVNKqoS7GJ4ncWdetRratfGGQU=");
  });
});

describe("HKDF: separación de dominios", () => {
  /**
   * EL test más importante del archivo. `authHash` viaja al server; `wrapKey`
   * abre la vaultKey. Si ambas derivaciones coincidieran, el server recibiría
   * de regalo la llave que envuelve el baúl y el zero-knowledge sería mentira.
   */
  it("authHash y wrapKey NUNCA coinciden para la misma masterKey", async () => {
    const mk = await testMasterKey();
    expect(await deriveAuthHash(mk)).not.toBe(
      toBase64(await deriveWrapKeyBytes(mk)),
    );
  });

  it("el authHash tampoco filtra la masterKey", async () => {
    const mk = await testMasterKey();
    expect(await deriveAuthHash(mk)).not.toBe(toBase64(mk));
  });

  /**
   * Mismo razonamiento del lado de recuperación: el server guarda
   * bcrypt(recovery_auth). Si `recovery_auth` fuera igual a la wrapKey de
   * recuperación, el server podría abrir el baúl con lo que él mismo almacena.
   */
  it("recoveryAuth y la wrapKey de recuperación NUNCA coinciden", async () => {
    const rec = randomBytes(20);
    expect(await deriveRecoveryAuth(rec)).not.toBe(
      toBase64(await deriveWrapKeyBytes(rec)),
    );
  });

  it("son deterministas", async () => {
    const mk = await testMasterKey();
    expect(await deriveAuthHash(mk)).toBe(await deriveAuthHash(mk));
    expect(await deriveWrapKeyBytes(mk)).toEqual(await deriveWrapKeyBytes(mk));
  });

  it("producen 32 bytes", async () => {
    const mk = await testMasterKey();
    expect(fromBase64(await deriveAuthHash(mk))).toHaveLength(32);
    expect(await deriveWrapKeyBytes(mk)).toHaveLength(32);
  });

  it("el authHash cabe en bcrypt sin truncarse (< 72 bytes)", async () => {
    // bcrypt ignora todo lo que pase de 72 bytes. 32 bytes en base64 = 44
    // chars: entra con margen. Si alguien subiera hashLen, esto avisa.
    const mk = await testMasterKey();
    expect(
      new TextEncoder().encode(await deriveAuthHash(mk)).length,
    ).toBeLessThan(72);
  });

  /**
   * VECTORES FIJOS de las tres etiquetas HKDF ("pm-auth-v1", "pm-wrap-v1",
   * "pm-recauth-v1"). Cambiar cualquiera de esos strings deja fuera a todos
   * los usuarios existentes; esto lo convierte en un fallo ruidoso en CI en
   * vez de un incidente en producción.
   */
  it("vectores conocidos: las etiquetas HKDF no han cambiado", async () => {
    const mk = await testMasterKey();
    expect(await deriveAuthHash(mk)).toBe(
      "KkjgMYfCd7BbGgU24hmarDJwcS98uDL31wJxz09WBoo=",
    );
    expect(toBase64(await deriveWrapKeyBytes(mk))).toBe(
      "uxLg5BZ+k73Mhuq66oyLMEvPL3IqNf7jS9EvYUasO1c=",
    );

    const rec = new Uint8Array(20).fill(7);
    expect(await deriveRecoveryAuth(rec)).toBe(
      "N2Ri9RROdUkoLDnIb8evOHHh6IighcE/z5fCwwwYTIo=",
    );
    expect(toBase64(await deriveWrapKeyBytes(rec))).toBe(
      "DqxV9lOti/oUQdefgNyOIkFGim/DTx1nyaQSHxJqv/w=",
    );
  });
});

describe("AES-256-GCM", () => {
  const key = () => importAesKey(randomBytes(32));

  it("hace round-trip de texto plano", async () => {
    const k = await key();
    expect(await aesDecrypt(k, await aesEncrypt(k, "contraseña secreta"))).toBe(
      "contraseña secreta",
    );
  });

  it("preserva unicode, emojis, comillas y saltos de línea", async () => {
    const k = await key();
    const text = 'línea 1\nlínea 2\t🔐 日本語 "comillas" \\ backslash';
    expect(await aesDecrypt(k, await aesEncrypt(k, text))).toBe(text);
  });

  /**
   * Reusar un nonce en GCM es catastrófico: permite recuperar el keystream y
   * falsificar mensajes. Cada cifrado debe traer un IV nuevo.
   */
  it("genera un IV distinto en cada cifrado", async () => {
    const k = await key();
    const ivs = new Set<string>();
    for (let i = 0; i < 100; i++)
      ivs.add((await aesEncrypt(k, "mismo texto")).iv);
    expect(ivs.size).toBe(100);
  });

  it("el IV mide 12 bytes (el tamaño recomendado para GCM)", async () => {
    const k = await key();
    expect(fromBase64((await aesEncrypt(k, "x")).iv)).toHaveLength(12);
  });

  it("cifra el mismo texto a ciphertexts distintos", async () => {
    const k = await key();
    expect((await aesEncrypt(k, "mismo texto")).ct).not.toBe(
      (await aesEncrypt(k, "mismo texto")).ct,
    );
  });

  it("falla con la llave equivocada", async () => {
    const blob = await aesEncrypt(await key(), "secreto");
    await expect(aesDecrypt(await key(), blob)).rejects.toThrow();
  });

  it("falla si el ciphertext fue manipulado (integridad del tag)", async () => {
    const k = await key();
    const blob = await aesEncrypt(k, "saldo: 100");
    const bytes = fromBase64(blob.ct);
    bytes[0] ^= 0xff;
    await expect(
      aesDecrypt(k, { ...blob, ct: toBase64(bytes) }),
    ).rejects.toThrow();
  });

  it("falla si el IV fue manipulado", async () => {
    const k = await key();
    const blob = await aesEncrypt(k, "saldo: 100");
    const iv = fromBase64(blob.iv);
    iv[0] ^= 0xff;
    await expect(
      aesDecrypt(k, { ...blob, iv: toBase64(iv) }),
    ).rejects.toThrow();
  });

  describe("AAD", () => {
    it("descifra cuando la AAD coincide", async () => {
      const k = await key();
      expect(
        await aesDecrypt(k, await aesEncrypt(k, "secreto", "item-1"), "item-1"),
      ).toBe("secreto");
    });

    it("falla con una AAD distinta", async () => {
      const k = await key();
      const blob = await aesEncrypt(k, "secreto", "item-1");
      await expect(aesDecrypt(k, blob, "item-2")).rejects.toThrow();
    });

    it("falla si se cifró CON AAD y se descifra SIN ella", async () => {
      const k = await key();
      const blob = await aesEncrypt(k, "secreto", "item-1");
      await expect(aesDecrypt(k, blob)).rejects.toThrow();
    });

    it("falla si se cifró SIN AAD y se descifra CON ella", async () => {
      const k = await key();
      const blob = await aesEncrypt(k, "secreto");
      await expect(aesDecrypt(k, blob, "item-1")).rejects.toThrow();
    });
  });
});

describe("vaultKey: generación y envoltura", () => {
  it("genera 32 bytes distintos en cada llamada", () => {
    const a = generateVaultKey();
    expect(a).toHaveLength(32);
    expect(a).not.toEqual(generateVaultKey());
  });

  it("hace round-trip wrap -> unwrap", async () => {
    const vaultKey = generateVaultKey();
    const wrapKey = randomBytes(32);
    expect(
      await unwrapVaultKey(await wrapVaultKey(vaultKey, wrapKey), wrapKey),
    ).toEqual(vaultKey);
  });

  it("no se abre con la wrapKey equivocada", async () => {
    const wrapped = await wrapVaultKey(generateVaultKey(), randomBytes(32));
    await expect(unwrapVaultKey(wrapped, randomBytes(32))).rejects.toThrow();
  });

  it("produce un blob distinto cada vez (IV nuevo) para la misma vaultKey", async () => {
    const vaultKey = generateVaultKey();
    const wrapKey = randomBytes(32);
    const a = await wrapVaultKey(vaultKey, wrapKey);
    const b = await wrapVaultKey(vaultKey, wrapKey);
    expect(a.ct).not.toBe(b.ct);
    // ...pero ambos abren a la misma llave.
    expect(await unwrapVaultKey(a, wrapKey)).toEqual(
      await unwrapVaultKey(b, wrapKey),
    );
  });

  it("el blob envuelto no contiene la vaultKey en claro", async () => {
    const vaultKey = generateVaultKey();
    const wrapped = await wrapVaultKey(vaultKey, randomBytes(32));
    expect(fromBase64(wrapped.ct)).not.toEqual(vaultKey);
  });
});
