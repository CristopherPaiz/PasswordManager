import { useEffect, useRef } from "react";

/**
 * Hace que el botón "atrás" (el del sistema en Android, el del navegador en
 * escritorio) CIERRE la capa abierta en vez de salirse de la página.
 *
 * Cómo: al abrirse se empuja una entrada al historial. Cuando el usuario da
 * atrás, el navegador la desapila y dispara `popstate`; ahí se llama a `onBack`
 * en lugar de navegar. Es el patrón estándar para modales, hojas y paneles.
 *
 * Cada entrada lleva un ID único, y eso resuelve los dos problemas de anidar:
 *
 * 1. `popstate` es un evento de `window`: TODAS las capas abiertas lo reciben.
 *    Comparando el ID se sabe si la entrada desapilada era la propia o la de
 *    otra capa, así un panel dentro de un modal no cierra también el modal.
 *
 * 2. Si la capa se cierra por otra vía (Escape, la X, clic fuera), su entrada
 *    seguiría en el historial y haría falta pulsar atrás dos veces para salir
 *    de la página. La limpieza la retira — pero solo si la entrada propia
 *    sigue siendo la actual, para no deshacer una navegación real.
 *
 * Resultado: con un panel abierto dentro de un modal hacen falta dos "atrás",
 * igual que en una app nativa.
 */

interface BackCloseState {
  __backClose: string;
}

const readId = (): string | null => {
  const state = window.history.state as BackCloseState | null;
  return state && typeof state.__backClose === "string" ? state.__backClose : null;
};

export const useBackClose = (active: boolean, onBack: () => void): void => {
  // El callback vive en un ref para que el efecto dependa SOLO de `active`.
  // Si dependiera de `onBack` y el padre lo recreara en cada render, se
  // empujaría una entrada nueva por render.
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });

  useEffect(() => {
    if (!active) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.history.pushState({ __backClose: id } satisfies BackCloseState, "");

    const handlePopState = () => {
      // Si la entrada actual sigue siendo la nuestra, lo que se desapiló fue
      // de otra capa: no nos toca reaccionar.
      if (readId() === id) return;
      onBackRef.current();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      // Solo se retira la entrada si sigue siendo la de arriba. Si el usuario
      // llegó aquí con "atrás", ya no lo es y no hay nada que hacer.
      if (readId() === id) window.history.back();
    };
  }, [active]);
};
