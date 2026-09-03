import { useTranslation } from "react-i18next";
import { Monitor, LogOut } from "lucide-react";
import { useGetQuery, useMutationQuery } from "@hooks/queries/core.queries";
import { API_ENDPOINTS } from "@constants/app.constants";
import { formatGuatemala } from "@utils/datetime";
import { SessionInfo } from "@apptypes";
import { Card, CardTitle } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";

const fmt = (s: string) => formatGuatemala(s.replace(" ", "T") + "Z");

export const SessionsCard = () => {
  const { t } = useTranslation();

  const { data, isLoading } = useGetQuery<{ sessions: SessionInfo[] }>({
    endpoint: API_ENDPOINTS.AUTH.SESSIONS,
  });
  const sessions = data?.sessions ?? [];

  const { mutateAsync: revoke, isPending } = useMutationQuery<{ message: string }, { id: number }>({
    endpoint: (vars) => API_ENDPOINTS.AUTH.SESSION_ITEM(vars.id),
    method: "delete",
    invalidateQueryKey: [API_ENDPOINTS.AUTH.SESSIONS],
    messageSuccess: t("settings.sessions.revoked"),
  });

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Monitor className="h-5 w-5 text-primary-500" />
        <CardTitle className="mb-0">{t("settings.sessions.title")}</CardTitle>
      </div>
      <p className="text-body text-text-muted">{t("settings.sessions.description")}</p>

      {isLoading ? (
        <p className="text-body text-text-muted">{t("common.loading")}</p>
      ) : sessions.length === 0 ? (
        <p className="text-body text-text-muted">{t("settings.sessions.none")}</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-input border border-border-base bg-bg-base p-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-body font-medium text-text-base">
                  <span className="truncate">{s.user_agent ?? t("settings.sessions.unknown")}</span>
                  {s.current && <Badge variant="success">{t("settings.sessions.current")}</Badge>}
                </p>
                <p className="text-caption text-text-muted">
                  {s.ip ? `${s.ip} · ` : ""}
                  {fmt(s.fecha_creacion)}
                </p>
              </div>
              {!s.current && (
                <button
                  type="button"
                  onClick={() => revoke({ id: s.id })}
                  disabled={isPending}
                  aria-label={t("settings.sessions.revoke")}
                  className="shrink-0 rounded-button p-2 text-signal-danger hover:bg-signal-danger/10 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
