import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, ShieldOff, Clock, QrCode, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { useMutationQuery } from "@hooks/queries/core.queries";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { useVaultStore } from "@store/vault.store";
import { API_ENDPOINTS, VAULT_AUTO_LOCK_MS } from "@constants/app.constants";
import { wrapVaultKey, deriveWrapKeyBytes, EncryptedBlob } from "@utils/crypto";
import { registerPasskey, isPasskeySupported } from "@utils/webauthn";
import { Card, CardTitle } from "@components/ui/Card";
import { Input } from "@components/ui/Input";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";

interface TotpSetupResponse {
  otpauth: string;
  qr: string;
  secret: string;
}

interface PasskeyRegisterPayload {
  cred_id: string;
  wrapped_vault_key: EncryptedBlob;
}

export const Security = () => {
  const { t } = useTranslation();
  const { data: authData } = useAuthQuery();
  const enabled = authData?.user?.totpEnabled ?? false;
  const passkeyEnabled = authData?.user?.passkeyEnabled ?? false;
  const username = authData?.user?.username ?? "";

  const vaultKeyRaw = useVaultStore((s) => s.vaultKeyRaw);
  const passkeySupported = isPasskeySupported();

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
    messageSuccess: t("security.totp.enabled"),
  });

  const { mutateAsync: totpDisable, isPending: isDisabling } = useMutationQuery<
    { message: string },
    { token: string }
  >({
    endpoint: API_ENDPOINTS.AUTH.TOTP_DISABLE,
    invalidateQueryKey: [API_ENDPOINTS.AUTH.ME],
    messageSuccess: t("security.totp.disabled"),
  });

  const { mutateAsync: passkeyRegister } = useMutationQuery<{ message: string }, PasskeyRegisterPayload>({
    endpoint: API_ENDPOINTS.AUTH.PASSKEY,
    invalidateQueryKey: [API_ENDPOINTS.AUTH.ME],
    messageSuccess: t("security.passkey.enabled"),
  });

  const { mutateAsync: passkeyDelete, isPending: isDeletingPasskey } = useMutationQuery<
    { message: string },
    void
  >({
    endpoint: API_ENDPOINTS.AUTH.PASSKEY,
    method: "delete",
    invalidateQueryKey: [API_ENDPOINTS.AUTH.ME],
    messageSuccess: t("security.passkey.disabled"),
  });

  const enablePasskey = async () => {
    if (!vaultKeyRaw) {
      toast.error(t("security.passkey.needUnlock"));
      return;
    }
    setIsPasskeyWorking(true);
    try {
      // La passkey entrega un secreto PRF; con él envolvemos la vaultKey.
      const { credId, prfSecret } = await registerPasskey(username);
      const wrapKey = await deriveWrapKeyBytes(prfSecret);
      const wrapped = await wrapVaultKey(vaultKeyRaw, wrapKey);
      await passkeyRegister({ cred_id: credId, wrapped_vault_key: wrapped });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const msg =
        code === "PASSKEY_NO_PRF"
          ? t("security.passkey.noPrf")
          : code === "PASSKEY_CANCELLED"
            ? t("security.passkey.cancelled")
            : t("security.passkey.error");
      toast.error(msg);
    } finally {
      setIsPasskeyWorking(false);
    }
  };

  const disablePasskey = async () => {
    try {
      await passkeyDelete();
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
      toast.error(error instanceof Error ? error.message : t("security.totp.setupError"));
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

  const autoLockMinutes = Math.round(VAULT_AUTO_LOCK_MS / 60000);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 min-w-0">
      <h1 className="text-2xl font-bold text-text-base">{t("security.title")}</h1>

      {/* --- 2FA --- */}
      <Card className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="mb-0">{t("security.totp.title")}</CardTitle>
          {enabled ? (
            <Badge variant="success">{t("security.totp.active")}</Badge>
          ) : (
            <Badge variant="neutral">{t("security.totp.inactive")}</Badge>
          )}
        </div>
        <p className="text-sm text-text-muted">{t("security.totp.description")}</p>

        {enabled ? (
          <div className="space-y-3 rounded-xl border border-border-base bg-bg-base p-4">
            <p className="text-sm font-medium text-text-base">{t("security.totp.disableHint")}</p>
            <Input
              label={t("security.totp.code")}
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
              {t("security.totp.disable")}
            </Button>
          </div>
        ) : setupData ? (
          <div className="space-y-4 rounded-xl border border-border-base bg-bg-base p-4">
            <p className="text-sm text-text-muted">{t("security.totp.scan")}</p>
            <img
              src={setupData.qr}
              alt={t("security.totp.qrAlt")}
              className="mx-auto h-48 w-48 rounded-xl bg-white p-2"
            />
            <div className="text-center">
              <p className="text-xs text-text-muted">{t("security.totp.manualKey")}</p>
              <p className="font-mono text-sm break-all select-all text-text-base">
                {setupData.secret}
              </p>
            </div>
            <Input
              label={t("security.totp.code")}
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
                {t("security.totp.confirm")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSetupData(null)}>
                {t("security.totp.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" icon={QrCode} isLoading={isSettingUp} onClick={startSetup}>
            {t("security.totp.activate")}
          </Button>
        )}
      </Card>

      {/* --- Passkey / huella --- */}
      <Card className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="mb-0">{t("security.passkey.title")}</CardTitle>
          {passkeyEnabled ? (
            <Badge variant="success">{t("security.passkey.active")}</Badge>
          ) : (
            <Badge variant="neutral">{t("security.passkey.inactive")}</Badge>
          )}
        </div>
        <p className="text-sm text-text-muted">{t("security.passkey.description")}</p>

        {!passkeySupported ? (
          <p className="rounded-xl bg-bg-base p-3 text-sm text-text-muted">
            {t("security.passkey.unsupported")}
          </p>
        ) : passkeyEnabled ? (
          <Button
            type="button"
            variant="danger"
            icon={Fingerprint}
            isLoading={isDeletingPasskey}
            onClick={disablePasskey}
          >
            {t("security.passkey.disable")}
          </Button>
        ) : (
          <div className="space-y-2">
            <Button
              type="button"
              icon={Fingerprint}
              isLoading={isPasskeyWorking}
              disabled={!vaultKeyRaw}
              onClick={enablePasskey}
            >
              {t("security.passkey.activate")}
            </Button>
            {!vaultKeyRaw && (
              <p className="text-xs text-text-muted">{t("security.passkey.needUnlock")}</p>
            )}
          </div>
        )}
      </Card>

      {/* --- Auto-lock --- */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary-500" />
          <CardTitle className="mb-0">{t("security.autolock.title")}</CardTitle>
        </div>
        <p className="text-sm text-text-muted">
          {t("security.autolock.description", { minutes: autoLockMinutes })}
        </p>
      </Card>
    </div>
  );
};
