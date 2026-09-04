import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, ShieldCheck } from "lucide-react";
import {
  TOTP_DEFAULTS,
  TotpConfig,
  formatCode,
  generateTotpCode,
  secondsRemaining,
} from "@utils/totp";
import type { VaultItemData } from "@apptypes";

/**
 * Código 2FA vivo de un item: se recalcula solo al cruzar cada paso de tiempo
 * y muestra cuánto le queda con un anillo de progreso.
 *
 * A diferencia de `SecretRow`, el código va SIEMPRE visible: caduca en 30s, no
 * sirve de nada esconderlo y ocultarlo solo añade un clic en el momento en que
 * el usuario tiene prisa por teclearlo.
 */

interface TotpCodeProps {
  data: VaultItemData;
  onCopy: (value: string, message: string) => void;
}

/** Saca la config del item, rellenando con los valores estándar (6/30/SHA1). */
const toConfig = (data: VaultItemData): TotpConfig | null =>
  data.totp
    ? {
        secret: data.totp,
        digits: data.totpDigits ?? TOTP_DEFAULTS.digits,
        period: data.totpPeriod ?? TOTP_DEFAULTS.period,
        algorithm: data.totpAlgorithm ?? TOTP_DEFAULTS.algorithm,
      }
    : null;

export const TotpCode = ({ data, onCopy }: TotpCodeProps) => {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [restante, setRestante] = useState(0);
  const [fallo, setFallo] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  const config = toConfig(data);
  const secret = config?.secret;
  const period = config?.period ?? TOTP_DEFAULTS.period;
  const digits = config?.digits ?? TOTP_DEFAULTS.digits;
  const algorithm = config?.algorithm ?? TOTP_DEFAULTS.algorithm;

  useEffect(() => {
    if (!secret) return;
    let vigente = true;

    // Un solo temporizador de 1s lleva la cuenta regresiva Y decide cuándo
    // recalcular: el código solo cambia al cruzar el borde del paso, así que
    // no hace falta rehacer el HMAC cada segundo.
    const tick = async () => {
      const quedan = secondsRemaining(period, Date.now());
      setRestante(quedan);
      if (quedan !== period && code) return;
      try {
        const nuevo = await generateTotpCode({ secret, digits, period, algorithm });
        if (vigente) {
          setCode(nuevo);
          setFallo(false);
        }
      } catch {
        // Secreto corrupto o alterado: se avisa en vez de mostrar un código
        // inventado que el servicio va a rechazar.
        if (vigente) setFallo(true);
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 1000);
    return () => {
      vigente = false;
      window.clearInterval(id);
    };
    // `code` fuera de las dependencias a propósito: entra en el closure del
    // tick y volver a montar el intervalo cada segundo sería justo lo contrario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, digits, period, algorithm]);

  if (!secret) return null;

  if (fallo) {
    return (
      <div className="rounded-input bg-bg-base px-3 py-2 text-body text-signal-danger">
        {t("vault.totp.invalidStored")}
      </div>
    );
  }

  const handleCopy = () => {
    onCopy(code, t("vault.totp.copied"));
    setJustCopied(true);
    window.setTimeout(() => setJustCopied(false), 1500);
  };

  // Anillo de progreso con un degradado cónico: cero SVG y cero dependencias.
  const grados = (restante / period) * 360;
  const porTerminar = restante <= 5;

  return (
    <div className="flex items-center gap-1 rounded-input bg-bg-base pl-3">
      <div className="flex min-w-0 flex-1 flex-col py-1.5">
        <span className="flex items-center gap-1 text-caption text-text-muted">
          <ShieldCheck className="h-3 w-3 shrink-0" />
          {t("vault.totp.label")}
        </span>
        <span
          className={`min-w-0 truncate font-mono text-body tabular-nums tracking-wider ${
            porTerminar ? "text-signal-danger" : "text-text-base"
          }`}
        >
          {code ? formatCode(code) : "······"}
        </span>
      </div>

      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(currentColor ${grados}deg, transparent 0deg)`,
        }}
        role="timer"
        aria-label={t("vault.totp.expiresIn", { seconds: restante })}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bg-base text-caption tabular-nums text-text-muted">
          {restante}
        </span>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        disabled={!code}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-button text-text-muted transition-colors hover:bg-bg-surface hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50 cursor-pointer"
        aria-label={t("vault.totp.copy")}
      >
        {justCopied ? (
          <Check className="h-4 w-4 text-signal-success" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
};
