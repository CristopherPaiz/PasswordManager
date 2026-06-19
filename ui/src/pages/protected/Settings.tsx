import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, ShieldOff, Clock, QrCode, Fingerprint, Compass, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useGetQuery, useMutationQuery } from "@hooks/queries/core.queries";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { useVaultStore } from "@store/vault.store";
import { useSettingsStore } from "@store/settings.store";
import { API_ENDPOINTS, AUTO_LOCK_OPTIONS, NAVIGATION } from "@constants/app.constants";
import { wrapVaultKey, deriveWrapKeyBytes, EncryptedBlob } from "@utils/crypto";
import { registerPasskey, isPasskeySupported, getDeviceLabel } from "@utils/webauthn";
import { formatGuatemalaDate } from "@utils/datetime";
import { PasskeyInfo } from "@apptypes";
import { Card, CardTitle } from "@components/ui/Card";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { ChangeMasterCard } from "@components/settings/ChangeMasterCard";
import { BackupCard } from "@components/settings/BackupCard";
import { SessionsCard } from "@components/settings/SessionsCard";

interface TotpSetupResponse {
  otpauth: string;
  qr: string;
  secret: string;
}

interface PasskeyRegisterPayload {
  cred_id: string;
  wrapped_vault_key: EncryptedBlob;
  label: string;
}

export const Settings = () => {
  const { t } = useTranslation();
  const { data: authData } = useAuthQuery();
  const enabled = authData?.user?.totpEnabled ?? false;
  const username = authData?.user?.username ?? "";

  const vaultKeyRaw = useVaultStore((s) => s.vaultKeyRaw);
  const passkeySupported = isPasskeySupported();

  const { autoLockMinutes, setAutoLockMinutes, startPage, setStartPage } = useSettingsStore();

  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [isPasskeyWorking, setIsPasskeyWorking] = useState(false);

  const { mutateAsync: totpSetup, isPending: isSettingUp } = useMutationQuery<TotpSetupResponse, void>({
    endpoint: API_ENDPOINTS.AUTH.TOTP_SETUP,
    showToast: false,
  });

  const { mutateAsync: totpEnable, isPending: isEnabling } = useMutationQuery<
    { message: string },
    { token: string }
  >({
    endpoint: API_ENDPOINTS.AUTH.TOTP_ENABLE,
    invalidateQueryKey: [API_ENDPOINTS.AUTH.ME],
    messageSuccess: t("settings.totp.enabled"),
  });

  const { mutateAsync: totpDisable, isPending: isDisabling } = useMutationQuery<
    { message: string },
    { token: string }
  >({
    endpoint: API_ENDPOINTS.AUTH.TOTP_DISABLE,
    invalidateQueryKey: [API_ENDPOINTS.AUTH.ME],
    messageSuccess: t("settings.totp.disabled"),
  });

  const { data: passkeyData, isLoading: isLoadingPasskeys } = useGetQuery<{ passkeys: PasskeyInfo[] }>({
    endpoint: API_ENDPOINTS.AUTH.PASSKEY_LIST,
  });
  const passkeys = passkeyData?.passkeys ?? [];

  const { mutateAsync: passkeyRegister } = useMutationQuery<{ message: string }, PasskeyRegisterPayload>({
    endpoint: API_ENDPOINTS.AUTH.PASSKEY,
    invalidateQueryKey: [API_ENDPOINTS.AUTH.PASSKEY_LIST, API_ENDPOINTS.AUTH.ME],
    messageSuccess: t("settings.passkey.enabled"),
  });

  const { mutateAsync: passkeyDelete, isPending: isDeletingPasskey } = useMutationQuery<
    { message: string },
    { id: number }
  >({
    endpoint: (vars) => API_ENDPOINTS.AUTH.PASSKEY_ITEM(vars.id),
    method: "delete",
    invalidateQueryKey: [API_ENDPOINTS.AUTH.PASSKEY_LIST, API_ENDPOINTS.AUTH.ME],
    messageSuccess: t("settings.passkey.disabled"),
  });

  const enablePasskey = async () => {
    if (!vaultKeyRaw) {
      toast.error(t("settings.passkey.needUnlock"));
      return;
    }
    setIsPasskeyWorking(true);
    try {
      // La passkey entrega un secreto PRF; con él envolvemos la vaultKey.
      const { credId, prfSecret } = await registerPasskey(username);
      const wrapKey = await deriveWrapKeyBytes(prfSecret);
      const wrapped = await wrapVaultKey(vaultKeyRaw, wrapKey);
      await passkeyRegister({ cred_id: credId, wrapped_vault_key: wrapped, label: getDeviceLabel() });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const msg =
        code === "PASSKEY_NO_PRF"
          ? t("settings.passkey.noPrf")
          : code === "PASSKEY_CANCELLED"
            ? t("settings.passkey.cancelled")
            : t("settings.passkey.error");
      toast.error(msg);
    } finally {
      setIsPasskeyWorking(false);
    }
  };

  const disablePasskey = async (id: number) => {
    try {
      await passkeyDelete({ id });
    } catch {
      // toast del hook
    }
  };

  const startSetup = async () => {
    try {
      const data = await totpSetup();
      setSetupData(data);
      setCode("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settings.totp.setupError"));
    }
  };

  const confirmEnable = async () => {
    try {
      await totpEnable({ token: code });
      setSetupData(null);
      setCode("");
    } catch {
      // El toast del hook ya muestra "Código inválido".
    }
  };

  const confirmDisable = async () => {
    try {
      await totpDisable({ token: disableCode });
      setDisableCode("");
    } catch {
      // toast del hook
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 min-w-0">
      <h1 className="text-2xl font-bold text-text-base">{t("settings.title")}</h1>

      {/* --- 2FA --- */}
      <Card className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="mb-0">{t("settings.totp.title")}</CardTitle>
          {enabled ? (
            <Badge variant="success">{t("settings.totp.active")}</Badge>
          ) : (
            <Badge variant="neutral">{t("settings.totp.inactive")}</Badge>
          )}
        </div>
        <p className="text-sm text-text-muted">{t("settings.totp.description")}</p>

        {enabled ? (
          <div className="space-y-3 rounded-xl border border-border-base bg-bg-base p-4">
            <p className="text-sm font-medium text-text-base">{t("settings.totp.disableHint")}</p>
            <Input
              label={t("settings.totp.code")}
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <Button
              type="button"
              variant="danger"
              icon={ShieldOff}
              isLoading={isDisabling}
              disabled={disableCode.length !== 6}
              onClick={confirmDisable}
            >
              {t("settings.totp.disable")}
            </Button>
          </div>
        ) : setupData ? (
          <div className="space-y-4 rounded-xl border border-border-base bg-bg-base p-4">
            <p className="text-sm text-text-muted">{t("settings.totp.scan")}</p>
            <img
              src={setupData.qr}
              alt={t("settings.totp.qrAlt")}
              className="mx-auto h-48 w-48 rounded-xl bg-white p-2"
            />
            <div className="text-center">
              <p className="text-xs text-text-muted">{t("settings.totp.manualKey")}</p>
              <p className="font-mono text-sm break-all select-all text-text-base">
                {setupData.secret}
              </p>
            </div>
            <Input
              label={t("settings.totp.code")}
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                icon={ShieldCheck}
                isLoading={isEnabling}
                disabled={code.length !== 6}
                onClick={confirmEnable}
              >
                {t("settings.totp.confirm")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSetupData(null)}>
                {t("settings.totp.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" icon={QrCode} isLoading={isSettingUp} onClick={startSetup}>
            {t("settings.totp.activate")}
          </Button>
        )}
      </Card>

      {/* --- Passkey / huella (una por dispositivo) --- */}
      <Card className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="mb-0">{t("settings.passkey.title")}</CardTitle>
          {passkeys.length > 0 ? (
            <Badge variant="success">{t("settings.passkey.active")}</Badge>
          ) : (
            <Badge variant="neutral">{t("settings.passkey.inactive")}</Badge>
          )}
        </div>
        <p className="text-sm text-text-muted">{t("settings.passkey.description")}</p>

        {!passkeySupported ? (
          <p className="rounded-xl bg-bg-base p-3 text-sm text-text-muted">
            {t("settings.passkey.unsupported")}
          </p>
        ) : (
          <>
            {isLoadingPasskeys ? (
              <p className="text-sm text-text-muted">{t("common.loading")}</p>
            ) : passkeys.length > 0 ? (
              <ul className="space-y-2">
                {passkeys.map((pk) => (
                  <li
                    key={pk.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border-base bg-bg-base p-3"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-medium text-text-base">
                        <Fingerprint className="h-4 w-4 shrink-0 text-primary-500" />
                        {pk.label ?? t("settings.passkey.unknownDevice")}
                      </p>
                      <p className="text-xs text-text-muted">
                        {t("settings.passkey.addedOn", {
                          date: formatGuatemalaDate(pk.fecha_creacion.replace(" ", "T") + "Z"),
                        })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => disablePasskey(pk.id)}
                      disabled={isDeletingPasskey}
                      aria-label={t("settings.passkey.remove")}
                      className="shrink-0 rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">{t("settings.passkey.none")}</p>
            )}

            <div className="space-y-2">
              <Button
                type="button"
                icon={Fingerprint}
                isLoading={isPasskeyWorking}
                disabled={!vaultKeyRaw}
                onClick={enablePasskey}
              >
                {t("settings.passkey.addThisDevice")}
              </Button>
              {!vaultKeyRaw && (
                <p className="text-xs text-text-muted">{t("settings.passkey.needUnlock")}</p>
              )}
              <p className="text-xs text-text-muted">{t("settings.passkey.help")}</p>
            </div>
          </>
        )}
      </Card>

      {/* --- Bloqueo automático (configurable) --- */}
      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary-500" />
          <CardTitle className="mb-0">{t("settings.autolock.title")}</CardTitle>
        </div>
        <p className="text-sm text-text-muted">{t("settings.autolock.description")}</p>
        <Select
          label={t("settings.autolock.label")}
          value={autoLockMinutes}
          onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
          options={AUTO_LOCK_OPTIONS.map((m) => ({
            value: m,
            label: t("settings.autolock.option", { minutes: m }),
          }))}
        />
      </Card>

      {/* --- Página de inicio (configurable) --- */}
      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary-500" />
          <CardTitle className="mb-0">{t("settings.startpage.title")}</CardTitle>
        </div>
        <p className="text-sm text-text-muted">{t("settings.startpage.description")}</p>
        <Select
          label={t("settings.startpage.label")}
          value={startPage}
          onChange={(e) => setStartPage(e.target.value)}
          options={NAVIGATION.PRIVATE.map((item) => ({
            value: item.path,
            label: t(item.labelKey),
          }))}
        />
      </Card>

      {/* --- Cambiar maestra / Respaldo / Sesiones --- */}
      <ChangeMasterCard />
      <BackupCard />
      <SessionsCard />
    </div>
  );
};
