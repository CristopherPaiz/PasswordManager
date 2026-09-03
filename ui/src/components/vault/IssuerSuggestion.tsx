import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Check } from "lucide-react";
import { IssuerMatch, lookupIssuer } from "@utils/card-issuer";
import { CardColorId } from "@utils/card-design";

/**
 * Sugiere el banco emisor a partir del BIN, consultando la tabla LOCAL.
 *
 * Es una sugerencia, nunca un autocompletado silencioso: la tabla es comunitaria
 * y puede equivocarse, y sobreescribir lo que el usuario escribió sería peor que
 * no sugerir nada. Por eso hay un botón explícito para aplicarla.
 *
 * No se muestra si el usuario ya escribió un emisor: en ese caso él sabe más
 * que la tabla.
 */

interface IssuerSuggestionProps {
  cardNumber: string;
  currentIssuer?: string;
  onApply: (issuer: string, color: CardColorId) => void;
}

export const IssuerSuggestion = ({
  cardNumber,
  currentIssuer,
  onApply,
}: IssuerSuggestionProps) => {
  const { t } = useTranslation();
  const [match, setMatch] = useState<IssuerMatch | null>(null);

  useEffect(() => {
    let cancelled = false;
    // La tabla se carga con import() dinámico; si el usuario sigue tecleando,
    // el resultado viejo se descarta en vez de pisar al nuevo.
    lookupIssuer(cardNumber).then((result) => {
      if (!cancelled) setMatch(result);
    });
    return () => {
      cancelled = true;
    };
  }, [cardNumber]);

  if (!match) return null;

  const alreadyApplied = currentIssuer?.trim() === match.name;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 rounded-input border border-border-base bg-bg-base px-3 py-2">
        <Building2 className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body text-text-base">{match.name}</p>
          <p className="text-caption text-text-muted">{t("vault.card.issuerDetected")}</p>
        </div>
        {alreadyApplied ? (
          <Check className="h-4 w-4 shrink-0 text-signal-success" aria-hidden="true" />
        ) : (
          <button
            type="button"
            onClick={() => onApply(match.name, match.color)}
            className="h-8 shrink-0 rounded-button border border-border-base px-3 text-caption font-medium text-text-base transition-colors hover:border-primary-500 hover:bg-bg-surface cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            {t("vault.card.useIssuer")}
          </button>
        )}
      </div>
      {/* La licencia CC-BY-4.0 del dataset exige atribución visible. De paso le
          dice al usuario que la consulta fue local, que es lo que protege su
          privacidad. */}
      <p className="text-caption text-text-muted">{t("vault.card.issuerSource")}</p>
    </div>
  );
};
