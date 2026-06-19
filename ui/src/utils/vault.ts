import {
  DEFAULT_KDF_PARAMS,
  EncryptedBlob,
  KdfParams,
  aesDecrypt,
  aesEncrypt,
  deriveAuthHash,
  deriveMasterKey,
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
}

export interface RegistrationResult {
  crypto: RegistrationCrypto;
  recoveryKey: string; // mostrar UNA vez al usuario
  vaultCryptoKey: CryptoKey; // ya lista en memoria, para desbloquear sin re-derivar
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

  return {
    crypto: { password: authHash, kdf_salt, kdf_params, wrapped_vault_key, wrapped_vault_key_recovery },
    recoveryKey: recovery.display,
    vaultCryptoKey: await importAesKey(vaultKey),
  };
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

// Desenvuelve la vaultKey y la importa como CryptoKey lista para usar.
export const openVaultKey = async (
  wrapped: EncryptedBlob,
  wrapKeyBytes: Uint8Array,
): Promise<CryptoKey> => {
  const raw = await unwrapVaultKey(wrapped, wrapKeyBytes);
  return importAesKey(raw);
};

// Apertura por llave de recuperación (deriva wrapKey desde la recoveryKey).
export const openVaultKeyWithRecovery = async (
  wrappedRecovery: EncryptedBlob,
  recoveryKey: string,
): Promise<CryptoKey> => {
  const recWrapKey = await deriveWrapKeyBytes(recoveryKeyToBytes(recoveryKey));
  return openVaultKey(wrappedRecovery, recWrapKey);
};

// ---------- cifrado/descifrado de items ----------

export const encryptVaultData = async (
  vaultKey: CryptoKey,
  data: VaultItemData,
): Promise<{ ciphertext: string; iv: string }> => {
  const blob = await aesEncrypt(vaultKey, JSON.stringify(data));
  return { ciphertext: blob.ct, iv: blob.iv };
};

export const decryptVaultData = async (
  vaultKey: CryptoKey,
  row: Pick<VaultItemRow, "ciphertext" | "iv">,
): Promise<VaultItemData> => {
  const plaintext = await aesDecrypt(vaultKey, { iv: row.iv, ct: row.ciphertext });
  return JSON.parse(plaintext) as VaultItemData;
};
