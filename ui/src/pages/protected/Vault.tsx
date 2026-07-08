import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Copy, Pencil, KeyRound, Globe, CreditCard, StickyNote, Star } from "lucide-react";
import { toast } from "sonner";
import { useGetQuery, useMutationQuery } from "@hooks/queries/core.queries";
import { useVaultStore } from "@store/vault.store";
import { API_ENDPOINTS } from "@constants/app.constants";
import { decryptVaultData, encryptVaultData, newVaultItemUid } from "@utils/vault";
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

const TYPE_ICONS: Record<VaultItemType, typeof KeyRound> = {
  password: KeyRound,
  card: CreditCard,
  note: StickyNote,
};

// Últimos 4 dígitos para mostrar la tarjeta sin exponerla en pantalla.
const maskCardNumber = (num: string): string => {
  const digits = num.replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "••••";
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

  const { data, isLoading } = useGetQuery<VaultListResponse>({
    endpoint: API_ENDPOINTS.VAULT.LIST,
    enabled: isUnlocked,
  });

  const { mutateAsync: deleteItem, isPending: isDeleting } = useMutationQuery<{ message: string }, void>({
    endpoint: () => API_ENDPOINTS.VAULT.ITEM(deleteTarget?.id ?? 0),
    method: "delete",
    invalidateQueryKey: [API_ENDPOINTS.VAULT.LIST],
    messageSuccess: t("vault.deleted"),
  });

  const { mutateAsync: updateFavorite } = useMutationQuery<{ message: string }, FavoritePayload>({
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
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (typeFilter !== "all" && it.tipo !== typeFilter) return false;
      if (onlyFavorites && !it.data.favorite) return false;
      if (folderFilter && it.data.folder !== folderFilter) return false;
      if (!q) return true;
      const haystack = [
        it.data.title,
        it.data.username,
        it.data.url,
        it.data.folder ?? "",
        it.data.cardHolder ?? "",
        ...(it.data.tags ?? []),
      ];
      return haystack.some((f) => f.toLowerCase().includes(q));
    });
  }, [items, query, typeFilter, onlyFavorites, folderFilter]);

  if (!isUnlocked || !vaultKey) return <UnlockVault />;

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (item: VaultItem) => {
    setEditing(item);
    setModalOpen(true);
  };

  const copy = async (text: string, label: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success(label);
    // Limpieza best-effort del portapapeles a los 30s.
    setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 30000);
  };

  // Re-cifra el item con `favorite` invertido (el flag vive DENTRO del blob).
  const toggleFavorite = async (item: VaultItem) => {
    try {
      const uid = item.uid ?? newVaultItemUid();
      const newData = { ...item.data, favorite: !item.data.favorite };
      const { ciphertext, iv } = await encryptVaultData(vaultKey, newData, uid);
      await updateFavorite({ id: item.id, tipo: item.tipo, ciphertext, iv, uid });
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
          <h1 className="text-2xl font-bold text-text-base">{t("vault.title")}</h1>
          <p className="text-sm text-text-muted">{t("vault.subtitle")}</p>
        </div>
        <Button icon={Plus} onClick={openNew} className="shrink-0">
          {t("vault.add")}
        </Button>
      </div>

      <SearchBar onSearch={setQuery} placeholder={t("vault.searchPlaceholder")} />

      {/* Filtros: tipo, favoritos y carpeta. Scroll horizontal en móvil. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto min-w-0 pb-1">
          {TYPE_TABS.map(({ value, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTypeFilter(value)}
              aria-pressed={typeFilter === value}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
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
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
              onlyFavorites
                ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                : "border-border-base text-text-muted hover:text-text-base"
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${onlyFavorites ? "fill-current" : ""}`} />
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

      {showSkeleton ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center">
          <p className="text-text-muted">{items.length === 0 ? t("vault.empty") : t("vault.noResults")}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((item) => {
            const TypeIcon = TYPE_ICONS[item.tipo] ?? KeyRound;
            return (
              <div
                key={item.id}
                className="min-w-0 rounded-2xl border border-border-base bg-bg-surface p-4 shadow-sm transition-colors hover:border-primary-500/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-2 font-semibold text-text-base">
                      <TypeIcon className="h-4 w-4 shrink-0 text-text-muted" />
                      <span className="truncate">{item.data.title}</span>
                    </h3>
                    {item.tipo === "password" && item.data.username && (
                      <p className="truncate text-sm text-text-muted">{item.data.username}</p>
                    )}
                    {item.tipo === "password" && item.data.url && (
                      <p className="mt-1 flex items-center gap-1 truncate text-xs text-text-muted">
                        <Globe className="h-3 w-3 shrink-0" />
                        <span className="truncate">{item.data.url}</span>
                      </p>
                    )}
                    {item.tipo === "card" && (
                      <p className="truncate text-sm text-text-muted">
                        {maskCardNumber(item.data.cardNumber ?? "")}
                        {item.data.cardHolder ? ` · ${item.data.cardHolder}` : ""}
                      </p>
                    )}
                    {item.tipo === "note" && item.data.notes && (
                      <p className="mt-1 text-sm text-text-muted line-clamp-2 break-words">
                        {item.data.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleFavorite(item)}
                      className="rounded-lg p-2 text-text-muted hover:bg-bg-base transition-colors cursor-pointer"
                      aria-label={t("vault.toggleFavorite")}
                      aria-pressed={Boolean(item.data.favorite)}
                    >
                      <Star
                        className={`h-4 w-4 ${item.data.favorite ? "fill-amber-500 text-amber-500" : ""}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="rounded-lg p-2 text-text-muted hover:bg-bg-base hover:text-text-base transition-colors cursor-pointer"
                      aria-label={t("vault.edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {(item.data.folder || (item.data.tags?.length ?? 0) > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.data.folder && (
                      <span className="rounded-full bg-primary-500/10 px-2 py-0.5 text-xs font-medium text-primary-600 dark:text-primary-400">
                        {item.data.folder}
                      </span>
                    )}
                    {item.data.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-bg-base px-2 py-0.5 text-xs text-text-muted border border-border-base"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {item.tipo === "password" && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        icon={KeyRound}
                        onClick={() => copy(item.data.password, t("vault.passwordCopied"))}
                      >
                        {t("vault.copyPassword")}
                      </Button>
                      {item.data.username && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          icon={Copy}
                          onClick={() => copy(item.data.username, t("vault.usernameCopied"))}
                        >
                          {t("vault.copyUsername")}
                        </Button>
                      )}
                    </>
                  )}
                  {item.tipo === "card" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      icon={Copy}
                      onClick={() => copy(item.data.cardNumber ?? "", t("vault.cardNumberCopied"))}
                    >
                      {t("vault.copyCardNumber")}
                    </Button>
                  )}
                  {item.tipo === "note" && item.data.notes && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      icon={Copy}
                      onClick={() => copy(item.data.notes, t("vault.noteCopied"))}
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
            <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t("vault.cancel")}
            </Button>
            <Button type="button" variant="danger" isLoading={isDeleting} onClick={confirmDelete}>
              {t("vault.delete")}
            </Button>
          </>
        }
      >
        <p className="text-text-muted">
          {t("vault.deleteConfirmText", { title: deleteTarget?.data.title ?? "" })}
        </p>
      </Modal>
    </div>
  );
};
