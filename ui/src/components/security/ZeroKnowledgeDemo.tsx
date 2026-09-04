import { ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Database, Eye, KeyRound, ShieldOff, Unlock } from "lucide-react";
import {
  DEFAULT_KDF_PARAMS,
  EncryptedBlob,
  aesDecrypt,
  aesEncrypt,
  deriveAuthHash,
  deriveMasterKey,
  deriveWrapKeyBytes,
  fromBase64,
  generateVaultKey,
  importAesKey,
  randomBytes,
  toBase64,
  wrapVaultKey,
} from "@utils/crypto";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";

/**
 * Demostración en vivo del modelo zero-knowledge.
 *
 * Corre la criptografía REAL de la app (los mismos `@utils/crypto` que usa el
 * registro) contra lo que el visitante escriba, en su navegador y sin una sola
 * petición de red. El objetivo es que no tenga que creer en la explicación:
 * puede ver el authHash que viajaría, el blob que se guardaría, y comprobar que
 * alterar un byte rompe el descifrado.
 */

interface DemoResult {
  salt: string;
  authHash: string;
  wrapKey: string;
  wrapped: EncryptedBlob;
  uid: string;
  blob: EncryptedBlob;
  decrypted: string;
  ms: number;
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
      {label}
    </p>
    {children}
  </div>
);

const Mono = ({ children }: { children: ReactNode }) => (
  <p className="break-all rounded-input border border-border-base bg-bg-base px-3 py-2 font-mono text-caption text-text-base">
    {children}
  </p>
);

export const ZeroKnowledgeDemo = () => {
  const { t } = useTranslation();

  const [master, setMaster] = useState("");
  const [secret, setSecret] = useState("hunter2");
  const [isWorking, setIsWorking] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [tampered, setTampered] = useState(false);

  // La llave del baúl de la demo vive solo aquí: no se guarda, no se envía y
  // muere al recargar. Va en un ref para no arrastrarla por cada render.
  const demoKey = useRef<CryptoKey | null>(null);

  const run = async () => {
    setIsWorking(true);
    setTampered(false);
    try {
      const salt = toBase64(randomBytes(16));

      // Mismos parámetros que en un registro real: el tiempo que tarde aquí es
      // el que un atacante paga por CADA intento de adivinar la maestra.
      const started = performance.now();
      const masterKey = await deriveMasterKey(master, salt, DEFAULT_KDF_PARAMS);
      const ms = Math.round(performance.now() - started);

      const authHash = await deriveAuthHash(masterKey);
      const wrapKeyBytes = await deriveWrapKeyBytes(masterKey);

      const vaultKey = generateVaultKey();
      const wrapped = await wrapVaultKey(vaultKey, wrapKeyBytes);

      const key = await importAesKey(vaultKey);
      demoKey.current = key;

      const uid = crypto.randomUUID();
      const blob = await aesEncrypt(key, JSON.stringify({ password: secret }), uid);
      const decrypted = await aesDecrypt(key, blob, uid);

      setResult({
        salt,
        authHash,
        wrapKey: toBase64(wrapKeyBytes),
        wrapped,
        uid,
        blob,
        decrypted,
        ms,
      });
    } finally {
      setIsWorking(false);
    }
  };

  // Simula a un servidor que altera el dato guardado: cambia un byte del
  // ciphertext y vuelve a intentar el descifrado. El tag GCM lo rechaza.
  const tamper = async () => {
    if (!result || !demoKey.current) return;
    const bytes = fromBase64(result.blob.ct);
    bytes[0] = bytes[0] ^ 0xff;
    try {
      await aesDecrypt(demoKey.current, { iv: result.blob.iv, ct: toBase64(bytes) }, result.uid);
      setTampered(false);
    } catch {
      setTampered(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label={t("security.demo.masterLabel")}
          type="password"
          autoComplete="off"
          placeholder={t("security.demo.masterPlaceholder")}
          value={master}
          disabled={isWorking}
          onChange={(e) => setMaster(e.target.value)}
        />
        <Input
          label={t("security.demo.secretLabel")}
          type="text"
          autoComplete="off"
          value={secret}
          disabled={isWorking}
          onChange={(e) => setSecret(e.target.value)}
        />
      </div>

      <Button
        type="button"
        icon={KeyRound}
        isLoading={isWorking}
        disabled={master.length === 0 || secret.length === 0}
        onClick={run}
        className="w-full sm:w-auto"
      >
        {isWorking
          ? t("security.demo.running")
          : result
            ? t("security.demo.again")
            : t("security.demo.run")}
      </Button>

      {result && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <p className="rounded-card border border-border-base bg-bg-base px-4 py-3 text-body text-text-muted">
            {t("security.demo.kdfTime", { ms: result.ms })}
          </p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="min-w-0 space-y-3 rounded-card border border-signal-info/40 bg-signal-info/5 p-4">
              <p className="flex items-center gap-2 font-semibold text-text-base">
                <ArrowRight className="h-4 w-4 shrink-0 text-signal-info" aria-hidden="true" />
                {t("security.demo.travels")}
              </p>
              <Field label={t("security.demo.authHash")}>
                <Mono>{result.authHash}</Mono>
              </Field>
              <Field label={t("security.demo.salt")}>
                <Mono>{result.salt}</Mono>
              </Field>
              <p className="text-caption text-text-muted">{t("security.demo.travelsNote")}</p>
            </div>

            <div className="min-w-0 space-y-3 rounded-card border border-signal-success/40 bg-signal-success/5 p-4">
              <p className="flex items-center gap-2 font-semibold text-text-base">
                <ShieldOff className="h-4 w-4 shrink-0 text-signal-success" aria-hidden="true" />
                {t("security.demo.stays")}
              </p>
              <Field label={t("security.demo.wrapKey")}>
                <Mono>{result.wrapKey}</Mono>
              </Field>
              <p className="text-caption text-text-muted">{t("security.demo.staysNote")}</p>
            </div>
          </div>

          <div className="min-w-0 space-y-3 rounded-card border border-border-base bg-bg-surface p-4">
            <p className="flex items-center gap-2 font-semibold text-text-base">
              <Database className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              {t("security.demo.stored")}
            </p>
            <Field label={t("security.demo.row")}>
              <div className="overflow-x-auto">
                <Mono>
                  {`uid: ${result.uid}`}
                  <br />
                  {`iv: ${result.blob.iv}`}
                  <br />
                  {`ciphertext: ${result.blob.ct}`}
                </Mono>
              </div>
            </Field>
            <p className="text-caption text-text-muted">{t("security.demo.storedNote")}</p>
          </div>

          <div className="min-w-0 space-y-3 rounded-card border border-border-base bg-bg-surface p-4">
            <p className="flex items-center gap-2 font-semibold text-text-base">
              <Unlock className="h-4 w-4 shrink-0 text-primary-500" aria-hidden="true" />
              {t("security.demo.decrypted")}
            </p>
            <Mono>{result.decrypted}</Mono>
          </div>

          <div className="min-w-0 space-y-3 rounded-card border border-border-base bg-bg-surface p-4">
            <p className="flex items-center gap-2 font-semibold text-text-base">
              <Eye className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              {t("security.demo.tamperTitle")}
            </p>
            <p className="text-body text-text-muted">{t("security.demo.tamperNote")}</p>
            <Button type="button" variant="secondary" size="sm" onClick={tamper}>
              {t("security.demo.tamper")}
            </Button>
            {tampered && (
              <p
                role="status"
                className="rounded-input border border-signal-danger/40 bg-signal-danger/10 px-3 py-2 text-body font-medium text-signal-danger"
              >
                {t("security.demo.tamperError")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
