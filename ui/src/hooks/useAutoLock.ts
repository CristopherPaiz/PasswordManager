import { useEffect, useRef } from "react";
import { useVaultStore } from "@store/vault.store";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

/**
 * Bloquea el baúl (borra la vaultKey de memoria) tras `timeoutMs` sin actividad.
 * Solo corre cuando el baúl está desbloqueado. Cualquier interacción reinicia
 * el temporizador. Al volver de una pestaña oculta, también re-evalúa.
 */
export const useAutoLock = (timeoutMs: number) => {
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const lock = useVaultStore((s) => s.lock);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!isUnlocked) return;

    const reset = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => lock(), timeoutMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") reset();
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    reset();

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [isUnlocked, lock, timeoutMs]);
};
