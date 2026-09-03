import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import { useServerTime } from "@hooks/useServerTime";
import { formatGuatemala, formatInZone } from "@utils/datetime";
import { Skeleton } from "@components/ui/Skeleton";

// Reloj en vivo anclado a la hora del servidor, mostrado SIEMPRE en hora de Guatemala.
export const ServerTime = () => {
  const { t } = useTranslation();
  const { info, isLoading } = useServerTime();
  const [now, setNow] = useState(() => Date.now());
  // offset = instante del servidor - instante del cliente (al recibir la respuesta).
  const offsetRef = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (info && offsetRef.current === null) {
      offsetRef.current = info.epoch - Date.now();
    }
  }, [info]);

  if (isLoading || !info) {
    return <Skeleton className="h-16 w-full" />;
  }

  const offset = offsetRef.current ?? 0;
  const serverNow = now + offset; // instante "en vivo" del servidor
  const serverZoneTime = formatInZone(serverNow, info.serverTimezone); // hora que tiene el server (su zona)
  const guatemalaTime = formatGuatemala(serverNow); // misma instante, en Guatemala
  const driftSeconds = Math.round(-offset / 1000); // positivo = tu reloj va adelantado

  return (
    <div className="flex items-start gap-3 p-4 bg-bg-base rounded-input border border-border-base">
      <div className="w-10 h-10 rounded-full bg-primary-50 dark:bg-primary-500/10 text-primary-500 flex items-center justify-center shrink-0">
        <Clock className="w-5 h-5" />
      </div>
      <div className="min-w-0 space-y-1.5">
        <p className="text-caption font-semibold text-text-base opacity-70">
          {t("serverTime.title")}
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body">
          <span className="text-text-muted">
            {t("serverTime.server")}{" "}
            <span className="opacity-70">({info.serverTimezone})</span>:
          </span>
          <span className="font-mono tabular-nums text-text-base">
            {serverZoneTime}
          </span>
          <span className="text-text-muted">{t("serverTime.guatemala")}:</span>
          <span className="font-mono tabular-nums text-text-base">
            {guatemalaTime}
          </span>
        </div>
        <p className="text-caption text-text-muted">
          {t("serverTime.drift", { seconds: driftSeconds })}
        </p>
      </div>
    </div>
  );
};
