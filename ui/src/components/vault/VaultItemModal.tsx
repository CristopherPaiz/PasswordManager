import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  KeyRound,
  RefreshCw,
  Save,
  StickyNote,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useMutationQuery } from "@hooks/queries/core.queries";
import { API_ENDPOINTS } from "@constants/app.constants";
import { encryptVaultData, newVaultItemUid } from "@utils/vault";
import {
  generatePassword,
  DEFAULT_PASSWORD_OPTIONS,
  PasswordOptions,
} from "@utils/password-generator";
import {
  detectCardBrand,
  formatCardNumber,
  formatExpiry,
  hasValidLength,
  isExpiryValid,
  isValidLuhn,
  maxCardDigits,
  onlyDigits,
} from "@utils/card-brand";
import { CardVisual } from "./CardVisual";
import { CardStylePicker } from "./CardStylePicker";
import { colorSwatch } from "@utils/card-design";
import { useBackClose } from "@hooks/useBackClose";
import { IssuerSuggestion } from "./IssuerSuggestion";
import { VaultItem, VaultItemData, VaultItemType } from "@apptypes";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Textarea } from "@components/ui/Textarea";
import { Button } from "@components/ui/Button";
import { StrengthMeter } from "@components/ui/StrengthMeter";

interface VaultItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaultKey: CryptoKey;
  item: VaultItem | null; // null = crear
  folders: string[]; // carpetas existentes (para sugerir)
  onDelete: (item: VaultItem) => void;
}

const EMPTY: VaultItemData = {
  title: "",
  username: "",
  password: "",
  url: "",
  notes: "",
};

const TYPE_OPTIONS: { value: VaultItemType; icon: typeof KeyRound }[] = [
  { value: "password", icon: KeyRound },
  { value: "card", icon: CreditCard },
  { value: "note", icon: StickyNote },
];

interface EncryptedPayload {
  tipo: VaultItemType;
  ciphertext: string;
  iv: string;
  uid: string;
}

export const VaultItemModal = ({
  isOpen,
  onClose,
  vaultKey,
  item,
  folders,
  onDelete,
}: VaultItemModalProps) => {
  const { t } = useTranslation();
  const foldersListId = useId();
  const [form, setForm] = useState<VaultItemData>(EMPTY);
  const [tipo, setTipo] = useState<VaultItemType>("password");
  const [tagsText, setTagsText] = useState("");
  const [genOptions, setGenOptions] = useState<PasswordOptions>(
    DEFAULT_PASSWORD_OPTIONS,
  );
  const [showGen, setShowGen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  // El modal tiene dos vistas. En móvil, apilar la vista previa + 12 colores
  // + 11 acabados + 6 campos en un solo scroll es ilegible, así que la
  // personalización vive en su propio panel.
  const [view, setView] = useState<"form" | "style">("form");

  useEffect(() => {
    if (isOpen) {
      setForm(item ? item.data : EMPTY);
      setTipo(item ? item.tipo : "password");
      setTagsText(item?.data.tags?.join(", ") ?? "");
      setShowGen(false);
      setView("form");
    }
  }, [isOpen, item]);

  const { mutateAsync: createItem } = useMutationQuery<
    { id: number },
    EncryptedPayload
  >({
    endpoint: API_ENDPOINTS.VAULT.LIST,
    invalidateQueryKey: [API_ENDPOINTS.VAULT.LIST],
    messageSuccess: t("vault.saved"),
  });

  const { mutateAsync: updateItem } = useMutationQuery<
    { message: string },
    EncryptedPayload
  >({
    endpoint: () => API_ENDPOINTS.VAULT.ITEM(item?.id ?? 0),
    method: "put",
    invalidateQueryKey: [API_ENDPOINTS.VAULT.LIST],
    messageSuccess: t("vault.saved"),
  });

  const setField = (key: keyof VaultItemData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useBackClose(isOpen && view === "style", () => setView("form"));

  const handleGenerate = () =>
    setField("password", generatePassword(genOptions));

  // Derivados de la tarjeta: la marca manda sobre agrupación, longitud del
  // CVV y máximo de dígitos, así que se calcula una sola vez por render.
  const cardDigits = onlyDigits(form.cardNumber ?? "");
  const cardBrand = detectCardBrand(cardDigits);

  const handleSave = async () => {
    if (form.title.trim().length === 0) {
      toast.error(t("vault.titleRequired"));
      return;
    }
    setIsWorking(true);
    try {
      const tags = tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const data: VaultItemData = {
        ...form,
        tags,
        folder: form.folder?.trim() || undefined,
      };

      // Cifrado en el navegador. El server solo recibe ciphertext + iv + uid.
      // Items legacy (sin uid) reciben uno aquí: migración perezosa al editar.
      const uid = item?.uid ?? newVaultItemUid();
      const { ciphertext, iv } = await encryptVaultData(vaultKey, data, uid);
      const payload: EncryptedPayload = { tipo, ciphertext, iv, uid };
      if (item) await updateItem(payload);
      else await createItem(payload);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("vault.saveError"),
      );
    } finally {
      setIsWorking(false);
    }
  };

  const toggleOption = (key: keyof Omit<PasswordOptions, "length">) =>
    setGenOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  // Vista de personalización: reemplaza el contenido del modal en vez de abrir
  // un modal anidado. En móvil un modal sobre otro atrapa el scroll y confunde
  // qué cierra qué; esto se comporta como una pantalla de ajustes nativa.
  if (isOpen && view === "style") {
    return (
      <Modal
        isOpen
        onClose={() => setView("form")}
        title={t("vault.card.customize")}
        size="lg"
        footer={
          <div className="flex w-full justify-end">
            <Button type="button" icon={ChevronLeft} variant="secondary" onClick={() => setView("form")}>
              {t("common.back")}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex justify-center">
            <CardVisual
              brand={cardBrand}
              number={form.cardNumber}
              holder={form.cardHolder}
              expiry={form.cardExpiry}
              issuer={form.cardIssuer}
              color={form.cardColor}
              design={form.cardDesign}
              revealed
              size="md"
            />
          </div>

          <CardStylePicker
            brand={cardBrand}
            color={form.cardColor ?? "brand"}
            design={form.cardDesign ?? "gradient"}
            onColorChange={(color) => setForm((prev) => ({ ...prev, cardColor: color }))}
            onDesignChange={(design) => setForm((prev) => ({ ...prev, cardDesign: design }))}
          />

          <p className="text-caption text-text-muted">{t("vault.card.styleNotice")}</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={item ? t("vault.editTitle") : t("vault.newTitle")}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {item ? (
            <Button
              type="button"
              variant="danger"
              icon={Trash2}
              onClick={() => onDelete(item)}
            >
              {t("vault.delete")}
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            icon={Save}
            isLoading={isWorking}
            onClick={handleSave}
          >
            {t("vault.save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Selector de tipo: solo al crear (cambiar el tipo de un item existente
            dejaría campos huérfanos). */}
        {!item && (
          <div className="grid grid-cols-3 gap-2">
            {TYPE_OPTIONS.map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTipo(value)}
                aria-pressed={tipo === value}
                className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-input border p-3 text-caption font-medium transition-colors cursor-pointer ${
                  tipo === value
                    ? "border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400"
                    : "border-border-base text-text-muted hover:border-primary-500/40 hover:text-text-base"
                }`}
              >
                <Icon className="h-5 w-5" />
                {t(`vault.types.${value}`)}
              </button>
            ))}
          </div>
        )}

        <Input
          label={t("vault.fields.title")}
          value={form.title}
          autoFocus
          onChange={(e) => setField("title", e.target.value)}
        />

        {tipo === "password" && (
          <>
            <Input
              label={t("vault.fields.username")}
              value={form.username}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setField("username", e.target.value)}
            />

            <div className="space-y-2">
              <Input
                label={t("vault.fields.password")}
                type="password"
                value={form.password}
                autoComplete="off"
                spellCheck={false}
                className="[&_input]:font-mono"
                onChange={(e) => setField("password", e.target.value)}
              />
              <StrengthMeter password={form.password} />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={RefreshCw}
                  onClick={handleGenerate}
                >
                  {t("vault.generator.generate")}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowGen((v) => !v)}
                  className="text-body text-primary-500 hover:text-primary-600 cursor-pointer"
                >
                  {showGen
                    ? t("vault.generator.hide")
                    : t("vault.generator.options")}
                </button>
              </div>

              {showGen && (
                <div className="rounded-input border border-border-base bg-bg-base p-4 space-y-3">
                  <label className="flex items-center justify-between gap-3 text-body text-text-base">
                    <span>
                      {t("vault.generator.length")}: {genOptions.length}
                    </span>
                    <input
                      type="range"
                      min={8}
                      max={64}
                      value={genOptions.length}
                      onChange={(e) =>
                        setGenOptions((p) => ({
                          ...p,
                          length: Number(e.target.value),
                        }))
                      }
                      className="w-1/2 accent-primary-500"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-body text-text-base">
                    {(
                      ["uppercase", "lowercase", "numbers", "symbols"] as const
                    ).map((key) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={genOptions[key]}
                          onChange={() => toggleOption(key)}
                          className="h-4 w-4 accent-primary-500"
                        />
                        {t(`vault.generator.${key}`)}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Input
              label={t("vault.fields.url")}
              value={form.url}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setField("url", e.target.value)}
            />
          </>
        )}

        {tipo === "card" && (
          <div className="space-y-4">
            {/* Vista previa en vivo: la MISMA pieza que se ve luego en la lista,
                así lo que capturas es exactamente lo que verás después. */}
            <div className="flex justify-center">
              <CardVisual
                brand={cardBrand}
                number={form.cardNumber}
                holder={form.cardHolder}
                expiry={form.cardExpiry}
                issuer={form.cardIssuer}
                color={form.cardColor}
                design={form.cardDesign}
                revealed
                size="md"
              />
            </div>

            {/* Disparador compacto: una fila que muestra la elección actual y
                abre el panel. Sustituye a 23 controles apilados. */}
            <button
              type="button"
              onClick={() => setView("style")}
              className="flex min-h-11 w-full items-center gap-3 rounded-input border border-border-base bg-bg-base px-3 py-2 text-left transition-colors hover:border-primary-500/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <span
                className="h-6 w-9 shrink-0 rounded-badge"
                style={{ backgroundImage: colorSwatch(cardBrand, form.cardColor ?? "brand") }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-body text-text-base">
                  {t("vault.card.customize")}
                </span>
                <span className="block truncate text-caption text-text-muted">
                  {t(`vault.card.colors.${form.cardColor ?? "brand"}`)} ·{" "}
                  {t(`vault.card.designs.${form.cardDesign ?? "gradient"}`)}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            </button>

            <Input
              label={t("vault.fields.cardIssuer")}
              placeholder={t("vault.fields.cardIssuerHint")}
              value={form.cardIssuer ?? ""}
              autoComplete="off"
              onChange={(e) => setField("cardIssuer", e.target.value)}
            />

            <Input
              label={t("vault.fields.cardHolder")}
              value={form.cardHolder ?? ""}
              autoComplete="cc-name"
              autoCapitalize="characters"
              onChange={(e) => setField("cardHolder", e.target.value)}
            />

            <div>
              <div className="relative">
                <Input
                  label={t("vault.fields.cardNumber")}
                  value={form.cardNumber ?? ""}
                  autoComplete="cc-number"
                  inputMode="numeric"
                  spellCheck={false}
                  className="[&_input]:font-mono [&_input]:tabular-nums [&_input]:pr-28"
                  // Reformatea a los grupos de LA MARCA conforme se escribe y
                  // corta en el máximo de dígitos que esa marca admite.
                  onChange={(e) => {
                    const digits = onlyDigits(e.target.value).slice(
                      0,
                      maxCardDigits(e.target.value),
                    );
                    setField("cardNumber", formatCardNumber(digits));
                  }}
                />
                {cardBrand.label && (
                  <span className="pointer-events-none absolute right-3 top-[1.9rem] max-w-[7rem] truncate rounded-badge bg-bg-surface px-2 py-1 text-caption font-medium text-text-muted">
                    {cardBrand.label}
                  </span>
                )}
              </div>
              {/* Sugerencia de emisor: tabla LOCAL, sin red. Aparece con 6
                  dígitos y NO pisa lo que el usuario haya escrito. */}
              {cardDigits.length >= 6 && (
                <div className="mt-2">
                  <IssuerSuggestion
                    cardNumber={cardDigits}
                    currentIssuer={form.cardIssuer}
                    onApply={(issuer, color) =>
                      setForm((prev) => ({ ...prev, cardIssuer: issuer, cardColor: color }))
                    }
                  />
                </div>
              )}
              {/* Avisos, nunca bloqueos: el usuario siempre puede guardar. Luhn
                  detecta dígitos mal tecleados, no valida que la tarjeta exista. */}
              {cardDigits.length >= 12 && !isValidLuhn(cardDigits) && (
                <p className="mt-1.5 text-caption text-signal-accent">
                  {t("vault.card.luhnWarning")}
                </p>
              )}
              {cardDigits.length >= 12 &&
                isValidLuhn(cardDigits) &&
                !hasValidLength(cardDigits) && (
                  <p className="mt-1.5 text-caption text-signal-accent">
                    {t("vault.card.lengthWarning", { brand: cardBrand.label })}
                  </p>
                )}
            </div>

            {/* Móvil: una columna. A partir de sm, vencimiento y CVV comparten fila. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Input
                  label={t("vault.fields.cardExpiry")}
                  value={form.cardExpiry ?? ""}
                  placeholder={t("vault.fields.cardExpiryHint")}
                  autoComplete="cc-exp"
                  inputMode="numeric"
                  className="[&_input]:font-mono [&_input]:tabular-nums"
                  onChange={(e) =>
                    setField("cardExpiry", formatExpiry(e.target.value))
                  }
                />
                {(form.cardExpiry ?? "").length === 5 &&
                  !isExpiryValid(form.cardExpiry ?? "") && (
                    <p className="mt-1.5 text-caption text-signal-accent">
                      {t("vault.card.expiryWarning")}
                    </p>
                  )}
              </div>
              <Input
                label={t("vault.fields.cardCvv")}
                type="password"
                value={form.cardCvv ?? ""}
                // Amex usa 4 dígitos y va al frente; el resto, 3 al reverso.
                placeholder={
                  cardBrand.cvvLength === 4
                    ? t("vault.fields.cardCvvHintAmex")
                    : t("vault.fields.cardCvvHint")
                }
                autoComplete="cc-csc"
                inputMode="numeric"
                maxLength={cardBrand.cvvLength}
                className="[&_input]:font-mono [&_input]:tabular-nums"
                onChange={(e) =>
                  setField(
                    "cardCvv",
                    onlyDigits(e.target.value).slice(0, cardBrand.cvvLength),
                  )
                }
              />
            </div>

            <div>
              <Input
                label={t("vault.fields.cardPin")}
                type="password"
                value={form.cardPin ?? ""}
                placeholder={t("vault.fields.cardPinHint")}
                autoComplete="off"
                inputMode="numeric"
                maxLength={12}
                className="[&_input]:font-mono [&_input]:tabular-nums"
                onChange={(e) =>
                  setField("cardPin", onlyDigits(e.target.value).slice(0, 12))
                }
              />
              <p className="mt-1.5 text-caption text-text-muted">
                {t("vault.card.pinNotice")}
              </p>
            </div>
          </div>
        )}

        <Textarea
          label={t("vault.fields.notes")}
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
        />

        {/* Organización: carpeta (con sugerencias), etiquetas y favorito.
            Todo esto viaja DENTRO del blob cifrado. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Input
              label={t("vault.fields.folder")}
              value={form.folder ?? ""}
              autoComplete="off"
              list={foldersListId}
              onChange={(e) => setField("folder", e.target.value)}
            />
            <datalist id={foldersListId}>
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          <Input
            label={t("vault.fields.tags")}
            value={tagsText}
            autoComplete="off"
            placeholder={t("vault.fields.tagsHint")}
            onChange={(e) => setTagsText(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-body text-text-base cursor-pointer">
          <input
            type="checkbox"
            checked={form.favorite ?? false}
            onChange={(e) => setField("favorite", e.target.checked)}
            className="h-4 w-4 accent-primary-500"
          />
          <Star className="h-4 w-4 text-signal-accent" />
          {t("vault.fields.favorite")}
        </label>
      </div>
    </Modal>
  );
};
