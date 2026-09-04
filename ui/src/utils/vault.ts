import {
  DEFAULT_KDF_PARAMS,
  EncryptedBlob,
  KdfParams,
  aesDecrypt,
  aesEncrypt,
  deriveAuthHash,
  deriveMasterKey,
  deriveRecoveryAuth,
  deriveWrapKeyBytes,
  generateRecoveryKey,
  generateVaultKey,
  importAesKey,
  randomBytes,
  recoveryKeyToBytes,
  toBase64,
  unwrapVaultKey,
  wrapVaultKey,
} from "./crypto";
import { VaultItemData, VaultItemRow } from "@apptypes";

// Payload cripto que viaja al server en el registro. Nada de esto revela secretos:
// authHash no permite reconstruir la maestra, y los blobs son inabribles sin la llave.
export interface RegistrationCrypto {
  password: string; // authHash (base64)
  kdf_salt: string;
  kdf_params: KdfParams;
  wrapped_vault_key: EncryptedBlob;
  wrapped_vault_key_recovery: EncryptedBlob;
  recovery_auth: string; // hash de la llave de recuperación (autoriza reset)
}

// Cripto nueva que reemplaza a la maestra durante un reset por recovery.
export interface MasterResetCrypto {
  password: string; // nuevo authHash
  kdf_salt: string;
  kdf_params: KdfParams;
  wrapped_vault_key: EncryptedBlob;
}

export interface RegistrationResult {
  crypto: RegistrationCrypto;
  recoveryKey: string; // mostrar UNA vez al usuario
  vaultCryptoKey: CryptoKey; // ya lista en memoria, para desbloquear sin re-derivar
  vaultKeyRaw: Uint8Array; // bytes crudos (para re-envolver: passkey, etc.)
}

/**
 * Construye todo lo necesario para crear la cuenta a partir de la maestra:
 * deriva llaves, genera la vaultKey y la llave de recuperación, y envuelve
 * la vaultKey con ambas. Todo en el navegador.
 */
export const buildRegistration = async (masterPassword: string): Promise<RegistrationResult> => {
  const kdf_salt = toBase64(randomBytes(16));
  const kdf_params = DEFAULT_KDF_PARAMS;

  const masterKey = await deriveMasterKey(masterPassword, kdf_salt, kdf_params);
  const authHash = await deriveAuthHash(masterKey);
  const wrapKey = await deriveWrapKeyBytes(masterKey);

  const vaultKey = generateVaultKey();
  const wrapped_vault_key = await wrapVaultKey(vaultKey, wrapKey);

  const recovery = generateRecoveryKey();
  const recWrapKey = await deriveWrapKeyBytes(recovery.bytes);
  const wrapped_vault_key_recovery = await wrapVaultKey(vaultKey, recWrapKey);
  const recovery_auth = await deriveRecoveryAuth(recovery.bytes);

  return {
    crypto: {
      password: authHash,
      kdf_salt,
      kdf_params,
      wrapped_vault_key,
      wrapped_vault_key_recovery,
      recovery_auth,
    },
    recoveryKey: recovery.display,
    vaultCryptoKey: await importAesKey(vaultKey),
    vaultKeyRaw: vaultKey,
  };
};

// Recupera la vaultKey cruda usando la llave de recuperación (para re-envolverla
// con una maestra nueva). Lanza si la llave de recuperación es incorrecta.
export const recoverVaultKeyRaw = async (
  wrappedRecovery: EncryptedBlob,
  recoveryKey: string,
): Promise<Uint8Array> => {
  const recWrapKey = await deriveWrapKeyBytes(recoveryKeyToBytes(recoveryKey));
  return unwrapVaultKey(wrappedRecovery, recWrapKey);
};

// Construye la cripto nueva (maestra nueva) reusando la misma vaultKey.
export const buildMasterReset = async (
  newMasterPassword: string,
  vaultKeyRaw: Uint8Array,
): Promise<MasterResetCrypto> => {
  const kdf_salt = toBase64(randomBytes(16));
  const kdf_params = DEFAULT_KDF_PARAMS;
  const masterKey = await deriveMasterKey(newMasterPassword, kdf_salt, kdf_params);
  const authHash = await deriveAuthHash(masterKey);
  const wrapKey = await deriveWrapKeyBytes(masterKey);
  const wrapped_vault_key = await wrapVaultKey(vaultKeyRaw, wrapKey);
  return { password: authHash, kdf_salt, kdf_params, wrapped_vault_key };
};

/**
 * ¿La cuenta está guardada con parámetros de Argon2id más débiles que los que
 * hoy usamos al registrar? Pasa con cuentas viejas: el registro fija los
 * parámetros del día y ahí se quedan aunque el default suba.
 *
 * Solo mira si algún parámetro se quedó CORTO (nunca al revés): una cuenta con
 * parámetros más fuertes que el default no se debilita.
 */
export const isKdfOutdated = (params: KdfParams): boolean =>
  params.algo !== DEFAULT_KDF_PARAMS.algo ||
  params.m < DEFAULT_KDF_PARAMS.m ||
  params.t < DEFAULT_KDF_PARAMS.t ||
  params.hashLen < DEFAULT_KDF_PARAMS.hashLen;

// Cripto para re-derivar la cuenta con los parámetros actuales SIN cambiar la
// maestra: salt nuevo, authHash nuevo y la MISMA vaultKey re-envuelta. El blob
// de recuperación no se toca (envuelve la misma vaultKey, que no se rota).
export const buildKdfUpgrade = async (
  masterPassword: string,
  vaultKeyRaw: Uint8Array,
  currentAuthHash: string,
): Promise<MasterResetCrypto & { current_password: string }> => {
  const fresh = await buildMasterReset(masterPassword, vaultKeyRaw);
  return { ...fresh, current_password: currentAuthHash };
};

// Deriva authHash + wrapKey para el login (con salt/params obtenidos del prelogin).
export const deriveLoginCredentials = async (
  masterPassword: string,
  kdfSalt: string,
  kdfParams: KdfParams,
): Promise<{ authHash: string; wrapKeyBytes: Uint8Array }> => {
  const masterKey = await deriveMasterKey(masterPassword, kdfSalt, kdfParams);
  const authHash = await deriveAuthHash(masterKey);
  const wrapKeyBytes = await deriveWrapKeyBytes(masterKey);
  return { authHash, wrapKeyBytes };
};

// Desenvuelve la vaultKey: devuelve la CryptoKey lista y los bytes crudos.
export const openVaultKey = async (
  wrapped: EncryptedBlob,
  wrapKeyBytes: Uint8Array,
): Promise<{ key: CryptoKey; raw: Uint8Array }> => {
  const raw = await unwrapVaultKey(wrapped, wrapKeyBytes);
  return { key: await importAesKey(raw), raw };
};

// ---------- cifrado/descifrado de items ----------

// uid por item, generado en el CLIENTE. Va en claro al server y como AAD del
// GCM: liga el blob a su fila (un server malicioso no puede intercambiar
// ciphertexts entre items sin romper el tag). Items legacy tienen uid null y
// se descifran sin AAD; adquieren uid al editarse.
export const newVaultItemUid = (): string => crypto.randomUUID();

export const encryptVaultData = async (
  vaultKey: CryptoKey,
  data: VaultItemData,
  uid: string,
): Promise<{ ciphertext: string; iv: string; uid: string }> => {
  const blob = await aesEncrypt(vaultKey, JSON.stringify(data), uid);
  return { ciphertext: blob.ct, iv: blob.iv, uid };
};

export const decryptVaultData = async (
  vaultKey: CryptoKey,
  row: Pick<VaultItemRow, "ciphertext" | "iv" | "uid">,
): Promise<VaultItemData> => {
  const plaintext = await aesDecrypt(
    vaultKey,
    { iv: row.iv, ct: row.ciphertext },
    row.uid ?? undefined,
  );
  return JSON.parse(plaintext) as VaultItemData;
};

// Cripto de rotación de la llave de recuperación: durante un reset, la llave
// usada se quema y se genera una NUEVA (blob + hash de autorización). El server
// exige esto en recovery/reset.
export const buildRecoveryRotation = async (
  vaultKeyRaw: Uint8Array,
): Promise<{
  wrapped_vault_key_recovery: EncryptedBlob;
  new_recovery_auth: string;
  recoveryKey: string;
}> => {
  const recovery = generateRecoveryKey();
  const recWrapKey = await deriveWrapKeyBytes(recovery.bytes);
  const wrapped_vault_key_recovery = await wrapVaultKey(vaultKeyRaw, recWrapKey);
  const new_recovery_auth = await deriveRecoveryAuth(recovery.bytes);
  return { wrapped_vault_key_recovery, new_recovery_auth, recoveryKey: recovery.display };
};
