import { useCallback, useEffect, useRef, useState } from "react";
import { useGetQuery, useMutationQuery } from "@hooks/queries/core.queries";
import { useVaultStore } from "@store/vault.store";
import { API_ENDPOINTS } from "@constants/app.constants";
import {
  IntegrityReport,
  buildManifest,
  decryptManifest,
  encryptManifest,
  readVersionWatermark,
  verifyManifest,
  writeVersionWatermark,
} from "@utils/manifest";
import { EncryptedBlob } from "@utils/crypto";
import { VaultItemRow } from "@apptypes";

interface ManifestResponse {
  manifest: EncryptedBlob | null;
  version: number;
}

interface ManifestVars {
  manifest: EncryptedBlob;
  version: number;
}

/**
 * Verifica el baúl contra su manifiesto firmado y lo re-firma cuando el cambio
 * viene de nosotros.
 *
 * Dos caminos:
 *   - `pendingSync` (hubo una escritura local) o no hay manifiesto todavía →
 *     se construye uno nuevo con versión +1 y se guarda. No se alerta: el
 *     cambio es del usuario.
 *   - en cualquier otro caso → se descifra el manifiesto y se compara con lo
 *     que el server acaba de entregar. Diferencias = alerta.
 *
 * Devuelve `report` solo cuando algo NO cuadra (si todo está bien, es null).
 */
export const useVaultIntegrity = (rows: VaultItemRow[] | undefined, userId?: number) => {
  const vaultKey = useVaultStore((s) => s.vaultKey);
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const pendingSync = useVaultStore((s) => s.pendingSync);
  const clearPendingSync = useVaultStore((s) => s.clearPendingSync);

  const [report, setReport] = useState<IntegrityReport | null>(null);
  // Evita re-firmar dos veces por el mismo cambio si el efecto se re-dispara
  // mientras la escritura del manifiesto sigue en vuelo.
  const isWriting = useRef(false);

  const { data: remote } = useGetQuery<ManifestResponse>({
    endpoint: API_ENDPOINTS.VAULT.MANIFEST,
    enabled: isUnlocked,
  });

  const { mutateAsync: saveManifest } = useMutationQuery<{ version: number }, ManifestVars>({
    endpoint: API_ENDPOINTS.VAULT.MANIFEST,
    method: "put",
    invalidateQueryKey: [API_ENDPOINTS.VAULT.MANIFEST],
    showToast: false,
  });

  // Re-firma el inventario con el estado actual del baúl. Se usa tanto para el
  // sellado automático tras una escritura propia como para el botón de
  // "reconocer" del aviso (cuando el usuario confirma que los cambios son suyos).
  const resign = useCallback(async () => {
    if (!vaultKey || !rows || !remote || userId === undefined || isWriting.current) return;
    isWriting.current = true;
    try {
      const version = Math.max(remote.version, readVersionWatermark(userId)) + 1;
      const manifest = await buildManifest(rows, version);
      const blob = await encryptManifest(vaultKey, manifest);
      await saveManifest({ manifest: blob, version });
      writeVersionWatermark(userId, version);
      clearPendingSync();
      setReport(null);
    } finally {
      isWriting.current = false;
    }
  }, [vaultKey, rows, remote, userId, saveManifest, clearPendingSync]);

  useEffect(() => {
    if (!vaultKey || !rows || !remote || userId === undefined) return;

    let cancelled = false;

    const run = async () => {
      // Primera vez (cuenta anterior al manifiesto) o cambio propio: sellar.
      if (!remote.manifest || pendingSync) {
        await resign().catch(() => {
          // Un fallo de red no debe romper el baúl: se reintenta al próximo
          // refetch, y mientras tanto `pendingSync` sigue marcado.
        });
        return;
      }

      try {
        const manifest = await decryptManifest(vaultKey, remote.manifest);
        const result = await verifyManifest(
          manifest,
          rows,
          remote.version,
          readVersionWatermark(userId),
        );
        if (cancelled) return;
        writeVersionWatermark(userId, remote.version);
        setReport(result.ok ? null : result);
      } catch {
        // El manifiesto no abrió: o el blob fue manipulado, o llegó de otra
        // llave. En ambos casos hay que avisar, no re-firmar en silencio.
        if (cancelled) return;
        setReport({
          missing: [],
          modified: [],
          unknown: [],
          missingLegacy: 0,
          rolledBack: false,
          unreadable: true,
          ok: false,
        });
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [vaultKey, rows, remote, pendingSync, userId, resign]);

  return { report, acknowledge: resign };
};
