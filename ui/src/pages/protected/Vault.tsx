import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Copy, Pencil, KeyRound, Globe } from "lucide-react";
import { toast } from "sonner";
import { useGetQuery, useMutationQuery } from "@hooks/queries/core.queries";
import { useVaultStore } from "@store/vault.store";
import { API_ENDPOINTS } from "@constants/app.constants";
import { decryptVaultData } from "@utils/vault";
import { VaultItem, VaultItemRow } from "@apptypes";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { SearchBar } from "@components/ui/SearchBar";
import { Skeleton } from "@components/ui/Skeleton";
import { Modal } from "@components/ui/Modal";
import { UnlockVault } from "@components/vault/UnlockVault";
import { VaultItemModal } from "@components/vault/VaultItemModal";

interface VaultListResponse {
  items: VaultItemRow[];
}

export const Vault = () => {
  const { t } = useTranslation();
  const { isUnlocked, vaultKey } = useVaultStore();

  const [items, setItems] = useState<VaultItem[]>([]);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [query, setQuery] = useState("");
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      [it.data.title, it.data.username, it.data.url].some((f) => f.toLowerCase().includes(q)),
    );
  }, [items, query]);

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
          {filtered.map((item) => (
            <div
              key={item.id}
              className="min-w-0 rounded-2xl border border-border-base bg-bg-surface p-4 shadow-sm transition-colors hover:border-primary-500/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-text-base">{item.data.title}</h3>
                  {item.data.username && (
                    <p className="truncate text-sm text-text-muted">{item.data.username}</p>
                  )}
                  {item.data.url && (
                    <p className="mt-1 flex items-center gap-1 truncate text-xs text-text-muted">
                      <Globe className="h-3 w-3 shrink-0" />
                      <span className="truncate">{item.data.url}</span>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="shrink-0 rounded-lg p-2 text-text-muted hover:bg-bg-base hover:text-text-base transition-colors cursor-pointer"
                  aria-label={t("vault.edit")}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
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
              </div>
            </div>
          ))}
        </div>
      )}

      <VaultItemModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        vaultKey={vaultKey}
        item={editing}
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
