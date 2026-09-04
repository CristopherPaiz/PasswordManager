import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  Brain,
  Cpu,
  KeyRound,
  Lock,
  Server,
  ShieldCheck,
  Wallet,
} from "lucide-react";

/**
 * Diagrama de la jerarquía de llaves.
 *
 * Va con cajas HTML y no con un SVG de texto posicionado a mano: los textos
 * vienen de i18n y cambian de largo entre idiomas, así que el layout tiene que
 * fluir. Además así hereda los tokens del tema y se apila solo en móvil.
 */

type Tone = "neutral" | "travels" | "stays";

const TONES: Record<Tone, string> = {
  neutral: "border-border-base bg-bg-surface",
  travels: "border-signal-info/40 bg-signal-info/5",
  stays: "border-signal-success/40 bg-signal-success/5",
};

const NOTE_TONES: Record<Tone, string> = {
  neutral: "text-text-muted",
  travels: "text-signal-info",
  stays: "text-signal-success",
};

interface NodeProps {
  icon: typeof KeyRound;
  label: string;
  note: string;
  tone?: Tone;
  className?: string;
}

const Node = ({ icon: Icon, label, note, tone = "neutral", className = "" }: NodeProps) => (
  <div
    className={`flex w-full min-w-0 items-center gap-3 rounded-card border px-4 py-3 ${TONES[tone]} ${className}`}
  >
    <Icon className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
    <div className="min-w-0">
      <p className="truncate font-medium text-text-base">{label}</p>
      <p className={`text-caption ${NOTE_TONES[tone]}`}>{note}</p>
    </div>
  </div>
);

// Flecha vertical con una etiqueta opcional (la transformación que ocurre).
const Step = ({ children }: { children?: ReactNode }) => (
  <div className="flex flex-col items-center gap-1 py-2" aria-hidden="true">
    <ArrowDown className="h-4 w-4 text-text-muted" />
    {children && (
      <span className="rounded-badge border border-border-base bg-bg-base px-2 py-0.5 text-caption text-text-muted">
        {children}
      </span>
    )}
  </div>
);

export const KeyHierarchy = () => {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex w-full max-w-xl min-w-0 flex-col">
      <Node icon={Brain} label={t("security.keys.master")} note={t("security.keys.masterNote")} />

      <Step>
        {t("security.keys.kdf")} · {t("security.keys.kdfNote")}
      </Step>

      <Node
        icon={Cpu}
        label={t("security.keys.masterKey")}
        note={t("security.keys.masterKeyNote")}
      />

      <Step>HKDF</Step>

      {/* La bifurcación: una rama sale al servidor, la otra jamás. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Node
          icon={Server}
          label={t("security.keys.authHash")}
          note={t("security.keys.authHashNote")}
          tone="travels"
        />
        <Node
          icon={ShieldCheck}
          label={t("security.keys.wrapKey")}
          note={t("security.keys.wrapKeyNote")}
          tone="stays"
        />
      </div>

      <Step />

      <Node
        icon={KeyRound}
        label={t("security.keys.vaultKey")}
        note={t("security.keys.vaultKeyNote")}
      />

      <Step>AES-256-GCM</Step>

      <Node icon={Wallet} label={t("security.keys.items")} note={t("security.keys.itemsNote")} />

      <p className="mt-6 flex items-start gap-2 rounded-card border border-border-base bg-bg-base px-4 py-3 text-body text-text-muted">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t("security.keys.note")}</span>
      </p>
    </div>
  );
};
