import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Copy,
  Check,
  Pencil,
  KeyRound,
  Globe,
  CreditCard,
  StickyNote,
  Star,
  Search as SearchIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useGetQuery, useMutationQuery } from "@hooks/queries/core.queries";
import { useVaultStore } from "@store/vault.store";
import { API_ENDPOINTS } from "@constants/app.constants";
import {
  decryptVaultData,
  encryptVaultData,
  newVaultItemUid,
} from "@utils/vault";
import { matchesSearch } from "@utils/search";
import {
  detectCardBrand,
  formatCardNumber,
  maskCardNumber,
  onlyDigits,
} from "@utils/card-brand";
import { CardVisual } from "@components/vault/CardVisual";
import { SecretRow } from "@components/vault/SecretRow";
import { TotpCode } from "@components/vault/TotpCode";
import { VaultItem, VaultItemRow, VaultItemType } from "@apptypes";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { SearchBar } from "@components/ui/SearchBar";
import { Select } from "@components/ui/Select";
import { Skeleton } from "@components/ui/Skeleton";
import { Modal } from "@components/ui/Modal";
import { UnlockVault } from "@components/vault/UnlockVault";
import { VaultItemModal } from "@components/vault/VaultItemModal";

interface VaultListResponse {
  items: VaultItemRow[];
}

type TypeFilter = "all" | VaultItemType;

const TYPE_TABS: { value: TypeFilter; icon?: typeof KeyRound }[] = [
  { value: "all" },
  { value: "password", icon: KeyRound },
  { value: "card", icon: CreditCard },
  { value: "note", icon: StickyNote },
];

// Identidad visual por tipo: icono + color del chip (claro y oscuro).
const TYPE_STYLES: Record<
  VaultItemType,
  { icon: typeof KeyRound; chip: string }
> = {
  password: { icon: KeyRound, chip: "bg-signal-info/10 text-signal-info" },
  card: { icon: CreditCard, chip: "bg-primary-500/10 text-primary-500" },
  note: { icon: StickyNote, chip: "bg-signal-accent/10 text-signal-accent" },
};

interface FavoritePayload {
  id: number;
  tipo: VaultItemType;
  ciphertext: string;
  iv: string;
  uid: string;
}

export const Vault = () => {
  const { t } = useTranslation();
  const { isUnlocked, vaultKey } = useVaultStore();

  const [items, setItems] = useState<VaultItem[]>([]);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [folderFilter, setFolderFilter] = useState("");
  const [editing, setEditing] = useState<VaultItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VaultItem | null>(null);
  // Feedback de copiado (muestra ✓ por ~1.5s) y contraseñas reveladas por item.
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { data, isLoading } = useGetQuery<VaultListResponse>({
    endpoint: API_ENDPOINTS.VAULT.LIST,
    enabled: isUnlocked,
  });

  const { mutateAsync: deleteItem, isPending: isDeleting } = useMutationQuery<
    { message: string },
    void
  >({
    endpoint: () => API_ENDPOINTS.VAULT.ITEM(deleteTarget?.id ?? 0),
    method: "delete",
    invalidateQueryKey: [API_ENDPOINTS.VAULT.LIST],
    messageSuccess: t("vault.deleted"),
  });

  const { mutateAsync: updateFavorite } = useMutationQuery<
    { message: string },
    FavoritePayload
  >({
    endpoint: (v) => API_ENDPOINTS.VAULT.ITEM(v.id),
    method: "put",
    invalidateQueryKey: [API_ENDPOINTS.VAULT.LIST],
    showToast: false,
  });

  // Descifra todas las filas en memoria cuando llegan o cambia la llave.
  useEffect(() => {
    if (!vaultKey || !data?.items) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setIsDecrypting(true);
    Promise.all(
      data.items.map(async (row) => {
        try {
          const decrypted = await decryptVaultData(vaultKey, row);
          return { ...row, data: decrypted } as VaultItem;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setItems(results.filter((r): r is VaultItem => r !== null));
      setIsDecrypting(false);
    });
    return () => {
      cancelled = true;
    };
  }, [vaultKey, data]);

  // Carpetas existentes (derivadas del contenido descifrado; el server no las ve).
  const folders = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.data.folder) set.add(it.data.folder);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (typeFilter !== "all" && it.tipo !== typeFilter) return false;
      if (onlyFavorites && !it.data.favorite) return false;
      if (folderFilter && it.data.folder !== folderFilter) return false;
      // Búsqueda fuzzy sobre TODOS los campos (insensible a mayúsculas y
      // tildes; "dbito" encuentra "débito"). Incluye el nombre del tipo
      // traducido para poder buscar "tarjeta" o "nota".
      const haystack = [
        it.data.title,
        it.data.username,
        it.data.url,
        it.data.notes,
        it.data.folder ?? "",
        it.data.cardHolder ?? "",
        it.data.cardNumber ?? "",
        it.data.cardExpiry ?? "",
        t(`vault.types.${it.tipo}`),
        ...(it.data.tags ?? []),
      ];
      return matchesSearch(query, haystack);
    });
  }, [items, query, typeFilter, onlyFavorites, folderFilter, t]);

  if (!isUnlocked || !vaultKey) return <UnlockVault />;

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (item: VaultItem) => {
    setEditing(item);
    setModalOpen(true);
  };

  const copy = async (text: string, label: string, key: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success(label);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    // Limpieza best-effort del portapapeles a los 30s.
    setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 30000);
  };

  // Re-cifra el item con `favorite` invertido (el flag vive DENTRO del blob).
  const toggleFavorite = async (item: VaultItem) => {
    try {
      const uid = item.uid ?? newVaultItemUid();
      const newData = { ...item.data, favorite: !item.data.favorite };
      const { ciphertext, iv } = await encryptVaultData(vaultKey, newData, uid);
      await updateFavorite({
        id: item.id,
        tipo: item.tipo,
        ciphertext,
        iv,
        uid,
      });
    } catch {
      toast.error(t("vault.saveError"));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteItem();
    } finally {
      setDeleteTarget(null);
      setModalOpen(false);
    }
  };

  const showSkeleton = isLoading || isDecrypting;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-subheading font-medium text-text-base">
            {t("vault.title")}
          </h1>
          <p className="text-body text-text-muted">{t("vault.subtitle")}</p>
        </div>
        <Button icon={Plus} onClick={openNew} className="shrink-0">
          {t("vault.add")}
        </Button>
      </div>

      <SearchBar
        onSearch={setQuery}
        placeholder={t("vault.searchPlaceholder")}
      />

      {/* Filtros: tipo, favoritos y carpeta. Scroll horizontal en móvil. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto min-w-0 pb-1">
          {TYPE_TABS.map(({ value, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTypeFilter(value)}
              aria-pressed={typeFilter === value}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-body font-medium transition-colors cursor-pointer ${
                typeFilter === value
                  ? "border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400"
                  : "border-border-base text-text-muted hover:text-text-base"
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {t(`vault.filters.${value}`)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOnlyFavorites((v) => !v)}
            aria-pressed={onlyFavorites}
            aria-label={t("vault.filters.favorites")}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-body font-medium transition-colors cursor-pointer ${
              onlyFavorites
                ? "border-signal-accent bg-signal-accent/10 text-signal-accent"
                : "border-border-base text-text-muted hover:text-text-base"
            }`}
          >
            <Star
              className={`h-3.5 w-3.5 ${onlyFavorites ? "fill-current" : ""}`}
            />
            {t("vault.filters.favorites")}
          </button>
        </div>

        {folders.length > 0 && (
          <div className="w-full sm:w-56 shrink-0">
            <Select
              aria-label={t("vault.filters.folder")}
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              options={[
                { value: "", label: t("vault.filters.allFolders") },
                ...folders.map((f) => ({ value: f, label: f })),
              ]}
            />
          </div>
        )}
      </div>

      {!showSkeleton && items.length > 0 && (
        <p className="text-body text-text-muted" aria-live="polite">
          {t("vault.resultCount", { count: filtered.length })}
        </p>
      )}

      {showSkeleton ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-card bg-primary-500/10 text-primary-500">
            {items.length === 0 ? (
              <KeyRound className="h-7 w-7" />
            ) : (
              <SearchIcon className="h-7 w-7" />
            )}
          </div>
          <p className="text-text-muted">
            {items.length === 0 ? t("vault.empty") : t("vault.noResults")}
          </p>
          {items.length === 0 && (
            <Button icon={Plus} onClick={openNew}>
              {t("vault.add")}
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((item) => {
            const { icon: TypeIcon, chip } = TYPE_STYLES[item.tipo];
            const brand = detectCardBrand(item.data.cardNumber ?? "");
            return (
              <div
                key={item.id}
                className="flex min-w-0 flex-col rounded-card border border-border-base bg-bg-surface p-4 transition-colors hover:border-primary-500/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-card ${chip}`}
                    >
                      <TypeIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-text-base">
                        {item.data.title}
                      </h3>
                      {item.tipo === "password" && item.data.username && (
                        <p className="truncate text-body text-text-muted">
                          {item.data.username}
                        </p>
                      )}
                      {item.tipo === "password" && item.data.url && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-caption text-text-muted">
                          <Globe className="h-3 w-3 shrink-0" />
                          <span className="truncate">{item.data.url}</span>
                        </p>
                      )}
                      {item.tipo === "card" && item.data.cardHolder && (
                        <p className="truncate text-body text-text-muted">
                          {item.data.cardHolder}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleFavorite(item)}
                      className="rounded-button p-2 text-text-muted hover:bg-bg-base transition-colors cursor-pointer"
                      aria-label={t("vault.toggleFavorite")}
                      aria-pressed={Boolean(item.data.favorite)}
                    >
                      <Star
                        className={`h-4 w-4 ${item.data.favorite ? "fill-signal-accent text-signal-accent" : ""}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="rounded-button p-2 text-text-muted hover:bg-bg-base hover:text-text-base transition-colors cursor-pointer"
                      aria-label={t("vault.edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {item.tipo === "password" &&
                  (item.data.password || item.data.totp) && (
                    <div className="mt-3 space-y-2">
                      {item.data.password && (
                        <SecretRow
                          label={t("vault.fields.password")}
                          value={item.data.password}
                          copyLabel={t("vault.copyPassword")}
                          copiedMessage={t("vault.passwordCopied")}
                          onCopy={(value, message) =>
                            copy(value, message, `${item.id}:pw`)
                          }
                        />
                      )}
                      {/* El código 2FA se recalcula solo mientras el item esté
                          en pantalla; al bloquearse el baúl desaparece con él. */}
                      <TotpCode
                        data={item.data}
                        onCopy={(value, message) =>
                          copy(value, message, `${item.id}:totp`)
                        }
                      />
                    </div>
                  )}

                {/* Tarjeta: el MISMO visual que la vista previa del modal, más
                    los tres datos sensibles como filas revelables e independientes.
                    El PIN nunca se muestra sin que el usuario lo pida. */}
                {item.tipo === "card" && (
                  <div className="mt-3 space-y-2">
                    <CardVisual
                      brand={brand}
                      number={item.data.cardNumber}
                      holder={item.data.cardHolder}
                      expiry={item.data.cardExpiry}
                      issuer={item.data.cardIssuer}
                      color={item.data.cardColor}
                      design={item.data.cardDesign}
                    />
                    <SecretRow
                      label={t("vault.card.number")}
                      value={onlyDigits(item.data.cardNumber ?? "")}
                      masked={maskCardNumber(item.data.cardNumber ?? "")}
                      formatted={formatCardNumber(item.data.cardNumber ?? "")}
                      copyLabel={t("vault.copyCardNumber")}
                      copiedMessage={t("vault.cardNumberCopied")}
                      onCopy={(value, message) =>
                        copy(value, message, `${item.id}:card`)
                      }
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <SecretRow
                        label={t("vault.fields.cardCvv")}
                        value={item.data.cardCvv ?? ""}
                        copyLabel={t("vault.copyCvv")}
                        copiedMessage={t("vault.cvvCopied")}
                        onCopy={(value, message) =>
                          copy(value, message, `${item.id}:cvv`)
                        }
                      />
                      <SecretRow
                        label={t("vault.fields.cardPin")}
                        value={item.data.cardPin ?? ""}
                        copyLabel={t("vault.copyPin")}
                        copiedMessage={t("vault.pinCopied")}
                        onCopy={(value, message) =>
                          copy(value, message, `${item.id}:pin`)
                        }
                      />
                    </div>
                  </div>
                )}

                {/* Nota: vista previa. */}
                {item.tipo === "note" && item.data.notes && (
                  <p className="mt-3 whitespace-pre-wrap break-words rounded-input bg-bg-base px-3 py-2 text-body text-text-muted line-clamp-4">
                    {item.data.notes}
                  </p>
                )}

                {(item.data.folder || (item.data.tags?.length ?? 0) > 0) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.data.folder && (
                      <span className="rounded-full bg-primary-500/10 px-2 py-0.5 text-caption font-medium text-primary-600 dark:text-primary-400">
                        {item.data.folder}
                      </span>
                    )}
                    {item.data.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border-base bg-bg-base px-2 py-0.5 text-caption text-text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2 border-t border-border-base pt-3">
                  {item.tipo === "password" && item.data.username && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      icon={copiedKey === `${item.id}:user` ? Check : Copy}
                      onClick={() =>
                        copy(
                          item.data.username,
                          t("vault.usernameCopied"),
                          `${item.id}:user`,
                        )
                      }
                    >
                      {t("vault.copyUsername")}
                    </Button>
                  )}
                  {item.tipo === "card" && item.data.cardHolder && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      icon={copiedKey === `${item.id}:holder` ? Check : Copy}
                      onClick={() =>
                        copy(
                          item.data.cardHolder ?? "",
                          t("vault.holderCopied"),
                          `${item.id}:holder`,
                        )
                      }
                    >
                      {t("vault.copyHolder")}
                    </Button>
                  )}
                  {item.tipo === "note" && item.data.notes && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      icon={copiedKey === `${item.id}:note` ? Check : Copy}
                      onClick={() =>
                        copy(
                          item.data.notes,
                          t("vault.noteCopied"),
                          `${item.id}:note`,
                        )
                      }
                    >
                      {t("vault.copyNote")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <VaultItemModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        vaultKey={vaultKey}
        item={editing}
        folders={folders}
        onDelete={(item) => setDeleteTarget(item)}
      />

      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t("vault.deleteConfirmTitle")}
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
            >
              {t("vault.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={isDeleting}
              onClick={confirmDelete}
            >
              {t("vault.delete")}
            </Button>
          </>
        }
      >
        <p className="text-text-muted">
          {t("vault.deleteConfirmText", {
            title: deleteTarget?.data.title ?? "",
          })}
        </p>
      </Modal>
    </div>
  );
};
