import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMutationQuery } from "@hooks/queries/core.queries";
import { API_ENDPOINTS } from "@constants/app.constants";
import { encryptVaultData } from "@utils/vault";
import { generatePassword, DEFAULT_PASSWORD_OPTIONS, PasswordOptions } from "@utils/password-generator";
import { VaultItem, VaultItemData } from "@apptypes";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Textarea } from "@components/ui/Textarea";
import { Button } from "@components/ui/Button";

interface VaultItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaultKey: CryptoKey;
  item: VaultItem | null; // null = crear
  onDelete: (item: VaultItem) => void;
}

const EMPTY: VaultItemData = { title: "", username: "", password: "", url: "", notes: "" };

interface EncryptedPayload {
  tipo: string;
  ciphertext: string;
  iv: string;
}

export const VaultItemModal = ({ isOpen, onClose, vaultKey, item, onDelete }: VaultItemModalProps) => {
  const { t } = useTranslation();
  const [form, setForm] = useState<VaultItemData>(EMPTY);
  const [genOptions, setGenOptions] = useState<PasswordOptions>(DEFAULT_PASSWORD_OPTIONS);
  const [showGen, setShowGen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(item ? item.data : EMPTY);
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

  const setField = (key: keyof VaultItemData, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleGenerate = () => setField("password", generatePassword(genOptions));

  const handleSave = async () => {
    if (form.title.trim().length === 0) {
      toast.error(t("vault.titleRequired"));
      return;
    }
    setIsWorking(true);
    try {
      // Cifrado en el navegador. El server solo recibe ciphertext + iv.
      const { ciphertext, iv } = await encryptVaultData(vaultKey, form);
      const payload: EncryptedPayload = { tipo: "password", ciphertext, iv };
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
        <Input
          label={t("vault.fields.title")}
          value={form.title}
          autoFocus
          onChange={(e) => setField("title", e.target.value)}
        />
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
        <Textarea
          label={t("vault.fields.notes")}
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
        />
      </div>
    </Modal>
  );
};
