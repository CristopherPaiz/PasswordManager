import { beforeAll, describe, expect, it } from "vitest";
import {
  RegistrationResult,
  buildMasterReset,
  buildRecoveryRotation,
  buildRegistration,
  decryptVaultData,
  deriveLoginCredentials,
  encryptVaultData,
  newVaultItemUid,
  openVaultKey,
  recoverVaultKeyRaw,
} from "./vault";
import { fromBase64, importAesKey } from "./crypto";
import { VaultItemData } from "@apptypes";

/**
 * Tests de los FLUJOS del baúl: registro, login, recuperación, cambio de
 * maestra y cifrado de items. Aquí es donde se verifica la promesa real del
 * producto: que un usuario nunca pierda el acceso a su baúl por un cambio de
 * contraseña, y que el server no pueda tocar los datos.
 *
 * `buildRegistration` usa los parámetros Argon2id de producción (64 MiB) y no
 * los recibe por parámetro, así que cada registro cuesta cientos de ms. Por eso
 * se registra UNA cuenta compartida en `beforeAll` para los tests que solo
 * leen; los que necesitan una cuenta fresca la piden explícitamente.
 */
const MASTER = "maestra-original-muy-larga-42";

let account: RegistrationResult;

beforeAll(async () => {
  account = await buildRegistration(MASTER);
}, 60000);

const sampleItem: VaultItemData = {
  title: "GitHub",
  username: "choper",
  password: "p4ssw0rd-con-símbolos-#$%",
  url: "https://github.com",
  notes: "línea 1\nlínea 2",
  folder: "Trabajo",
  tags: ["dev", "código"],
  favorite: true,
};

describe("buildRegistration", () => {
  it("produce un authHash de 32 bytes y un salt de 16", () => {
    expect(fromBase64(account.crypto.password)).toHaveLength(32);
    expect(fromBase64(account.crypto.kdf_salt)).toHaveLength(16);
  });

  it("entrega una llave de recuperación con el formato mostrable", () => {
    expect(account.recoveryKey).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){7}$/);
  });

  it("guarda los parámetros KDF para que el cliente pueda re-derivar", () => {
    expect(account.crypto.kdf_params.algo).toBe("argon2id");
    expect(account.crypto.kdf_params.hashLen).toBe(32);
  });

  it("la vaultKey se abre con la maestra", async () => {
    const { wrapKeyBytes } = await deriveLoginCredentials(
      MASTER,
      account.crypto.kdf_salt,
      account.crypto.kdf_params,
    );
    const { raw } = await openVaultKey(account.crypto.wrapped_vault_key, wrapKeyBytes);
    expect(raw).toEqual(account.vaultKeyRaw);
  });

  it("la MISMA vaultKey se abre también con la llave de recuperación", async () => {
    const raw = await recoverVaultKeyRaw(
      account.crypto.wrapped_vault_key_recovery,
      account.recoveryKey,
    );
    expect(raw).toEqual(account.vaultKeyRaw);
  });

  /**
   * Dos cuentas con LA MISMA contraseña maestra no deben compartir nada: si el
   * salt fuera fijo, el authHash sería igual para ambas y una fuga de la BD
   * revelaría qué usuarios reusan contraseña.
   */
  it("dos cuentas con la misma maestra no comparten salt, authHash ni vaultKey", async () => {
    const otra = await buildRegistration(MASTER);
    expect(otra.crypto.kdf_salt).not.toBe(account.crypto.kdf_salt);
    expect(otra.crypto.password).not.toBe(account.crypto.password);
    expect(otra.vaultKeyRaw).not.toEqual(account.vaultKeyRaw);
  });

  it("el recovery_auth que ve el server no abre el baúl", async () => {
    // El server guarda bcrypt(recovery_auth). Aunque lo tuviera en claro, no
    // le sirve como wrapKey: es una derivación de dominio distinto.
    await expect(
      openVaultKey(account.crypto.wrapped_vault_key_recovery, fromBase64(account.crypto.recovery_auth)),
    ).rejects.toThrow();
  });
});

describe("login", () => {
  it("la maestra correcta reproduce el authHash del registro", async () => {
    const { authHash } = await deriveLoginCredentials(
      MASTER,
      account.crypto.kdf_salt,
      account.crypto.kdf_params,
    );
    expect(authHash).toBe(account.crypto.password);
  });

  it("una maestra incorrecta ni produce el authHash ni abre la vaultKey", async () => {
    const { authHash, wrapKeyBytes } = await deriveLoginCredentials(
      "maestra-equivocada",
      account.crypto.kdf_salt,
      account.crypto.kdf_params,
    );
    expect(authHash).not.toBe(account.crypto.password);
    await expect(openVaultKey(account.crypto.wrapped_vault_key, wrapKeyBytes)).rejects.toThrow();
  });
});

describe("recuperación y reset de la maestra", () => {
  it("una llave de recuperación incorrecta no abre la vaultKey", async () => {
    await expect(
      recoverVaultKeyRaw(account.crypto.wrapped_vault_key_recovery, "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA"),
    ).rejects.toThrow();
  });

  /**
   * El flujo completo, que es la promesa del producto: olvidar la maestra NO
   * puede significar perder el baúl. Se recupera la vaultKey con la llave de
   * recuperación, se re-envuelve con una maestra nueva, y los items cifrados
   * ANTES del reset deben seguir descifrando DESPUÉS.
   */
  it("reset con la llave de recuperación: maestra nueva, mismo baúl legible", async () => {
    const cuenta = await buildRegistration("maestra-vieja-123456");

    // Un item guardado con la maestra vieja.
    const uid = newVaultItemUid();
    const guardado = await encryptVaultData(cuenta.vaultCryptoKey, sampleItem, uid);

    // Reset.
    const vaultKeyRaw = await recoverVaultKeyRaw(
      cuenta.crypto.wrapped_vault_key_recovery,
      cuenta.recoveryKey,
    );
    const nueva = await buildMasterReset("maestra-nueva-654321", vaultKeyRaw);

    // Login con la maestra NUEVA.
    const { authHash, wrapKeyBytes } = await deriveLoginCredentials(
      "maestra-nueva-654321",
      nueva.kdf_salt,
      nueva.kdf_params,
    );
    expect(authHash).toBe(nueva.password);

    const { key, raw } = await openVaultKey(nueva.wrapped_vault_key, wrapKeyBytes);
    expect(raw).toEqual(cuenta.vaultKeyRaw); // la vaultKey NO cambió

    // El item viejo sigue descifrando: no hubo que re-cifrar el baúl.
    expect(await decryptVaultData(key, { ...guardado, uid })).toEqual(sampleItem);
  }, 60000);

  it("tras el reset, la maestra VIEJA ya no sirve", async () => {
    const cuenta = await buildRegistration("maestra-vieja-abcdef");
    const vaultKeyRaw = await recoverVaultKeyRaw(
      cuenta.crypto.wrapped_vault_key_recovery,
      cuenta.recoveryKey,
    );
    const nueva = await buildMasterReset("maestra-nueva-fedcba", vaultKeyRaw);

    const { authHash, wrapKeyBytes } = await deriveLoginCredentials(
      "maestra-vieja-abcdef",
      nueva.kdf_salt,
      nueva.kdf_params,
    );
    expect(authHash).not.toBe(nueva.password);
    await expect(openVaultKey(nueva.wrapped_vault_key, wrapKeyBytes)).rejects.toThrow();
  }, 60000);
});

describe("rotación de la llave de recuperación", () => {
  /**
   * El server exige rotación en cada reset: la llave usada se quema. Si la
   * vieja siguiera abriendo el blob nuevo, "quemarla" sería decorativo y una
   * llave filtrada valdría para siempre.
   */
  it("la llave nueva abre la misma vaultKey y la vieja ya no", async () => {
    const rotacion = await buildRecoveryRotation(account.vaultKeyRaw);

    expect(await recoverVaultKeyRaw(rotacion.wrapped_vault_key_recovery, rotacion.recoveryKey))
      .toEqual(account.vaultKeyRaw);

    await expect(
      recoverVaultKeyRaw(rotacion.wrapped_vault_key_recovery, account.recoveryKey),
    ).rejects.toThrow();
  });

  it("cambia el hash de autorización que guarda el server", async () => {
    const rotacion = await buildRecoveryRotation(account.vaultKeyRaw);
    expect(rotacion.new_recovery_auth).not.toBe(account.crypto.recovery_auth);
  });

  it("dos rotaciones seguidas producen llaves distintas", async () => {
    const a = await buildRecoveryRotation(account.vaultKeyRaw);
    const b = await buildRecoveryRotation(account.vaultKeyRaw);
    expect(a.recoveryKey).not.toBe(b.recoveryKey);
  });
});

describe("cifrado de items", () => {
  it("hace round-trip conservando todos los campos", async () => {
    const uid = newVaultItemUid();
    const fila = await encryptVaultData(account.vaultCryptoKey, sampleItem, uid);
    expect(await decryptVaultData(account.vaultCryptoKey, { ...fila, uid })).toEqual(sampleItem);
  });

  it("hace round-trip de un item tipo tarjeta", async () => {
    const tarjeta: VaultItemData = {
      title: "Visa",
      username: "",
      password: "",
      url: "",
      notes: "",
      cardHolder: "CRISTOPHER PAIZ",
      cardNumber: "4111111111111111",
      cardExpiry: "12/30",
      cardCvv: "123",
    };
    const uid = newVaultItemUid();
    const fila = await encryptVaultData(account.vaultCryptoKey, tarjeta, uid);
    expect(await decryptVaultData(account.vaultCryptoKey, { ...fila, uid })).toEqual(tarjeta);
  });

  it("el ciphertext no filtra el contenido en claro", async () => {
    const uid = newVaultItemUid();
    const fila = await encryptVaultData(account.vaultCryptoKey, sampleItem, uid);
    expect(fila.ciphertext).not.toContain("GitHub");
    expect(fila.ciphertext).not.toContain("choper");
  });

  it("no se descifra con la vaultKey de otra cuenta", async () => {
    const otra = await buildRegistration("otra-maestra-999999");
    const uid = newVaultItemUid();
    const fila = await encryptVaultData(account.vaultCryptoKey, sampleItem, uid);
    await expect(decryptVaultData(otra.vaultCryptoKey, { ...fila, uid })).rejects.toThrow();
  }, 60000);

  describe("uid como AAD: el server no puede reordenar el baúl", () => {
    it("descifrar con el uid de otro item falla", async () => {
      const uidA = newVaultItemUid();
      const uidB = newVaultItemUid();
      const fila = await encryptVaultData(account.vaultCryptoKey, sampleItem, uidA);
      await expect(
        decryptVaultData(account.vaultCryptoKey, { ...fila, uid: uidB }),
      ).rejects.toThrow();
    });

    /**
     * Simula un server malicioso que intercambia los ciphertexts de dos filas
     * para, por ejemplo, hacer que la contraseña que el usuario cree de "banco"
     * sea en realidad la de otro sitio. Con la AAD atada al uid, ambas filas
     * fallan al descifrar en vez de devolver datos equivocados en silencio.
     */
    it("intercambiar ciphertexts entre dos filas rompe ambas", async () => {
      const uidA = newVaultItemUid();
      const uidB = newVaultItemUid();
      const filaA = await encryptVaultData(account.vaultCryptoKey, sampleItem, uidA);
      const filaB = await encryptVaultData(
        account.vaultCryptoKey,
        { ...sampleItem, title: "Banco" },
        uidB,
      );

      const swapA = { ciphertext: filaB.ciphertext, iv: filaB.iv, uid: uidA };
      const swapB = { ciphertext: filaA.ciphertext, iv: filaA.iv, uid: uidB };

      await expect(decryptVaultData(account.vaultCryptoKey, swapA)).rejects.toThrow();
      await expect(decryptVaultData(account.vaultCryptoKey, swapB)).rejects.toThrow();
    });

    it("un item legacy (uid null) se descifra sin AAD", async () => {
      // Los items previos al AAD se cifraron sin ella. Deben seguir abriendo,
      // porque adquieren uid solo al editarse (migración perezosa).
      const { aesEncrypt } = await import("./crypto");
      const blob = await aesEncrypt(account.vaultCryptoKey, JSON.stringify(sampleItem));
      const legacy = { ciphertext: blob.ct, iv: blob.iv, uid: null };
      expect(await decryptVaultData(account.vaultCryptoKey, legacy)).toEqual(sampleItem);
    });

    it("un item legacy NO se descifra si el server le inventa un uid", async () => {
      const { aesEncrypt } = await import("./crypto");
      const blob = await aesEncrypt(account.vaultCryptoKey, JSON.stringify(sampleItem));
      await expect(
        decryptVaultData(account.vaultCryptoKey, {
          ciphertext: blob.ct,
          iv: blob.iv,
          uid: newVaultItemUid(),
        }),
      ).rejects.toThrow();
    });
  });

  describe("newVaultItemUid", () => {
    it("genera uids únicos", () => {
      const uids = new Set(Array.from({ length: 1000 }, newVaultItemUid));
      expect(uids.size).toBe(1000);
    });

    /**
     * El server valida `uid` con zod: `.trim().min(8).max(64)`. Si el cliente
     * generara algo fuera de ese rango, cada guardado fallaría con 400.
     */
    it("cumple el rango que exige el schema del server (8-64 chars)", () => {
      const uid = newVaultItemUid();
      expect(uid.length).toBeGreaterThanOrEqual(8);
      expect(uid.length).toBeLessThanOrEqual(64);
      expect(uid.trim()).toBe(uid);
    });
  });
});

describe("openVaultKey", () => {
  it("devuelve una CryptoKey usable además de los bytes crudos", async () => {
    const { wrapKeyBytes } = await deriveLoginCredentials(
      MASTER,
      account.crypto.kdf_salt,
      account.crypto.kdf_params,
    );
    const { key, raw } = await openVaultKey(account.crypto.wrapped_vault_key, wrapKeyBytes);

    // La CryptoKey devuelta debe ser equivalente a importar los bytes crudos:
    // lo que cifra una, lo descifra la otra.
    const uid = newVaultItemUid();
    const fila = await encryptVaultData(key, sampleItem, uid);
    const desdeRaw = await importAesKey(raw);
    expect(await decryptVaultData(desdeRaw, { ...fila, uid })).toEqual(sampleItem);
  });

  it("la CryptoKey no es extraíble (no se puede exportar la vaultKey)", async () => {
    expect(account.vaultCryptoKey.extractable).toBe(false);
  });
});
