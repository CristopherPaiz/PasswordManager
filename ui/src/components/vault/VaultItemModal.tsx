import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreditCard, KeyRound, RefreshCw, Save, StickyNote, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMutationQuery } from "@hooks/queries/core.queries";
import { API_ENDPOINTS } from "@constants/app.constants";
import { encryptVaultData, newVaultItemUid } from "@utils/vault";
import { generatePassword, DEFAULT_PASSWORD_OPTIONS, PasswordOptions } from "@utils/password-generator";
import { VaultItem, VaultItemData, VaultItemType } from "@apptypes";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Textarea } from "@components/ui/Textarea";
import { Button } from "@components/ui/Button";

interface VaultItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaultKey: CryptoKey;
  item: VaultItem | null; // null = crear
  folders: string[]; // carpetas existentes (para sugerir)
  onDelete: (item: VaultItem) => void;
}

const EMPTY: VaultItemData = { title: "", username: "", password: "", url: "", notes: "" };

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

export const VaultItemModal = ({ isOpen, onClose, vaultKey, item, folders, onDelete }: VaultItemModalProps) => {
  const { t } = useTranslation();
  const foldersListId = useId();
  const [form, setForm] = useState<VaultItemData>(EMPTY);
  const [tipo, setTipo] = useState<VaultItemType>("password");
  const [tagsText, setTagsText] = useState("");
  const [genOptions, setGenOptions] = useState<PasswordOptions>(DEFAULT_PASSWORD_OPTIONS);
  const [showGen, setShowGen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(item ? item.data : EMPTY);
      setTipo(item ? item.tipo : "password");
      setTagsText(item?.data.tags?.join(", ") ?? "");
      setShowGen(false);
    }
  }, [isOpen, item]);

  const { mutateAsync: createItem } = useMutationQuery<{ id: number }, EncryptedPayload>({
    endpoint: API_ENDPOINTS.VAULT.LIST,
    invalidateQueryKey: [API_ENDPOINTS.VAULT.LIST],
    messageSuccess: t("vault.saved"),
  });

  const { mutateAsync: updateItem } = useMutationQuery<{ message: string }, EncryptedPayload>({
    endpoint: () => API_ENDPOINTS.VAULT.ITEM(item?.id ?? 0),
    method: "put",
    invalidateQueryKey: [API_ENDPOINTS.VAULT.LIST],
    messageSuccess: t("vault.saved"),
  });

  const setField = (key: keyof VaultItemData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleGenerate = () => setField("password", generatePassword(genOptions));

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
      const data: VaultItemData = { ...form, tags, folder: form.folder?.trim() || undefined };

      // Cifrado en el navegador. El server solo recibe ciphertext + iv + uid.
      // Items legacy (sin uid) reciben uno aquí: migración perezosa al editar.
      const uid = item?.uid ?? newVaultItemUid();
      const { ciphertext, iv } = await encryptVaultData(vaultKey, data, uid);
      const payload: EncryptedPayload = { tipo, ciphertext, iv, uid };
      if (item) await updateItem(payload);
      else await createItem(payload);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("vault.saveError"));
    } finally {
      setIsWorking(false);
    }
  };

  const toggleOption = (key: keyof Omit<PasswordOptions, "length">) =>
    setGenOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={item ? t("vault.editTitle") : t("vault.newTitle")}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {item ? (
            <Button type="button" variant="danger" icon={Trash2} onClick={() => onDelete(item)}>
              {t("vault.delete")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" icon={Save} isLoading={isWorking} onClick={handleSave}>
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
                className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-medium transition-colors cursor-pointer ${
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
                onChange={(e) => setField("password", e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="secondary" icon={RefreshCw} onClick={handleGenerate}>
                  {t("vault.generator.generate")}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowGen((v) => !v)}
                  className="text-sm text-primary-500 hover:text-primary-600 cursor-pointer"
                >
                  {showGen ? t("vault.generator.hide") : t("vault.generator.options")}
                </button>
              </div>

              {showGen && (
                <div className="rounded-xl border border-border-base bg-bg-base p-4 space-y-3">
                  <label className="flex items-center justify-between gap-3 text-sm text-text-base">
                    <span>{t("vault.generator.length")}: {genOptions.length}</span>
                    <input
                      type="range"
                      min={8}
                      max={64}
                      value={genOptions.length}
                      onChange={(e) => setGenOptions((p) => ({ ...p, length: Number(e.target.value) }))}
                      className="w-1/2 accent-primary-500"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-sm text-text-base">
                    {(["uppercase", "lowercase", "numbers", "symbols"] as const).map((key) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
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
          <>
            <Input
              label={t("vault.fields.cardHolder")}
              value={form.cardHolder ?? ""}
              autoComplete="off"
              onChange={(e) => setField("cardHolder", e.target.value)}
            />
            <Input
              label={t("vault.fields.cardNumber")}
              value={form.cardNumber ?? ""}
              autoComplete="off"
              inputMode="numeric"
              spellCheck={false}
              onChange={(e) => setField("cardNumber", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t("vault.fields.cardExpiry")}
                value={form.cardExpiry ?? ""}
                placeholder={t("vault.fields.cardExpiryHint")}
                autoComplete="off"
                inputMode="numeric"
                onChange={(e) => setField("cardExpiry", e.target.value)}
              />
              <Input
                label={t("vault.fields.cardCvv")}
                type="password"
                value={form.cardCvv ?? ""}
                autoComplete="off"
                inputMode="numeric"
                onChange={(e) => setField("cardCvv", e.target.value)}
              />
            </div>
          </>
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

        <label className="flex items-center gap-2 text-sm text-text-base cursor-pointer">
          <input
            type="checkbox"
            checked={form.favorite ?? false}
            onChange={(e) => setField("favorite", e.target.checked)}
            className="h-4 w-4 accent-primary-500"
          />
          <Star className="h-4 w-4 text-amber-500" />
          {t("vault.fields.favorite")}
        </label>
      </div>
    </Modal>
  );
};
