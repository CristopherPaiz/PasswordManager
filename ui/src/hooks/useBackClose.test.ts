import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests del hook SIN React: se ejercita la lógica de historial directamente,
 * porque el bug que importa no está en el render sino en cómo interactúan
 * varias capas con un único evento `popstate` de `window`.
 *
 * Se simula un historial mínimo: una pila de estados y un `back()` que desapila
 * y despacha el evento, que es exactamente el contrato del navegador.
 */

interface Entry {
  state: unknown;
}

class FakeHistory {
  stack: Entry[] = [{ state: null }];
  private listeners: (() => void)[] = [];

  get state(): unknown {
    return this.stack[this.stack.length - 1].state;
  }

  pushState(state: unknown): void {
    this.stack.push({ state });
  }

  back(): void {
    if (this.stack.length > 1) this.stack.pop();
    this.listeners.forEach((fn) => fn());
  }

  addListener(fn: () => void): void {
    this.listeners.push(fn);
  }

  removeListener(fn: () => void): void {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }
}

let history: FakeHistory;

/**
 * Réplica exacta del cuerpo del efecto de `useBackClose`. Devuelve la función
 * de limpieza, igual que el efecto real.
 */
const activate = (onBack: () => void): (() => void) => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  history.pushState({ __backClose: id });

  const readId = (): string | null => {
    const state = history.state as { __backClose?: string } | null;
    return state && typeof state.__backClose === "string" ? state.__backClose : null;
  };

  const handlePopState = () => {
    if (readId() === id) return;
    onBack();
  };

  history.addListener(handlePopState);

  return () => {
    history.removeListener(handlePopState);
    if (readId() === id) history.back();
  };
};

beforeEach(() => {
  history = new FakeHistory();
});

afterEach(() => vi.restoreAllMocks());

describe("useBackClose", () => {
  it("empuja una entrada al activarse", () => {
    activate(() => {});
    expect(history.stack).toHaveLength(2);
  });

  it("el botón atrás dispara onBack en vez de navegar", () => {
    const onBack = vi.fn();
    activate(onBack);
    history.back();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  /**
   * Si se cierra con Escape o la X, la entrada empujada seguiría ahí y el
   * usuario tendría que pulsar atrás dos veces para salir de la página.
   */
  it("al cerrar por otra vía retira su entrada del historial", () => {
    const cleanup = activate(() => {});
    expect(history.stack).toHaveLength(2);
    cleanup();
    expect(history.stack).toHaveLength(1);
  });

  it("no retira nada si ya se cerró con atrás (no deshace navegación)", () => {
    const onBack = vi.fn();
    const cleanup = activate(onBack);
    history.back(); // el usuario pulsa atrás
    expect(history.stack).toHaveLength(1);
    cleanup(); // React limpia después
    expect(history.stack).toHaveLength(1); // no se fue de más
  });

  describe("capas anidadas (panel dentro de modal)", () => {
    it("el primer atrás cierra solo la capa de arriba", () => {
      const cerrarModal = vi.fn();
      const cerrarPanel = vi.fn();
      activate(cerrarModal);
      activate(cerrarPanel);

      history.back();

      expect(cerrarPanel).toHaveBeenCalledTimes(1);
      // El modal NO debe cerrarse: su entrada sigue siendo la actual.
      expect(cerrarModal).not.toHaveBeenCalled();
    });

    it("el segundo atrás cierra la capa de abajo", () => {
      const cerrarModal = vi.fn();
      const cerrarPanel = vi.fn();
      const limpiarModal = activate(cerrarModal);
      const limpiarPanel = activate(cerrarPanel);

      history.back();
      limpiarPanel(); // el panel se desmonta tras cerrarse
      history.back();

      expect(cerrarModal).toHaveBeenCalledTimes(1);
      limpiarModal();
      expect(history.stack).toHaveLength(1);
    });

    /**
     * El caso que rompía la versión con bandera compartida: abrir el panel,
     * volver con atrás, y luego cerrar el modal con la X. La entrada del modal
     * debía quedar retirada; con la bandera obsoleta se quedaba colgada.
     */
    it("tras volver del panel, cerrar el modal con la X deja el historial limpio", () => {
      const limpiarModal = activate(() => {});
      const limpiarPanel = activate(() => {});

      history.back(); // atrás: se cierra el panel
      limpiarPanel();
      expect(history.stack).toHaveLength(2); // queda la del modal

      limpiarModal(); // la X cierra el modal
      expect(history.stack).toHaveLength(1);
    });
  });

  it("cada capa empuja una entrada con id propio", () => {
    activate(() => {});
    activate(() => {});
    const ids = history.stack
      .slice(1)
      .map((e) => (e.state as { __backClose: string }).__backClose);
    expect(new Set(ids).size).toBe(2);
  });
});
