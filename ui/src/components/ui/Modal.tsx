import { ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

type ModalSize = "sm" | "md" | "lg" | "xl";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalProps) => {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Track where the press started so dragging from inside and releasing on the
  // backdrop (e.g. selecting text) does not close the modal.
  const pointerDownOnBackdrop = useRef(false);

  // Escape + atrapado de foco (Tab/Shift+Tab no salen del modal).
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  // Guarda el foco previo, mueve el foco al modal y lo devuelve al cerrar.
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    return () => previouslyFocused?.focus();
  }, [isOpen]);

  // Bloquea el scroll del fondo mientras el modal está abierto (evita que el
  // contenido detrás se desplace al llegar al final del modal).
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onMouseDown={(e) => {
        pointerDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (closeOnBackdrop && pointerDownOnBackdrop.current && e.target === e.currentTarget) {
          onClose();
        }
        pointerDownOnBackdrop.current = false;
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`w-full ${SIZE_CLASSES[size]} max-h-[90dvh] flex flex-col bg-bg-surface border border-border-base rounded-2xl shadow-2xl outline-none animate-in zoom-in-95 fade-in duration-200`}
      >
        {title && (
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border-base shrink-0">
            <h2 id={titleId} className="text-lg font-bold text-text-base">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 -mr-1.5 text-text-muted hover:text-text-base hover:bg-bg-base rounded-lg transition-colors cursor-pointer"
              aria-label={t("common.close")}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* overscroll-contain corta el "scroll chaining": al llegar al final del
            modal el gesto NO se propaga al fondo. */}
        <div className="px-6 py-5 overflow-y-auto overscroll-contain text-text-muted">{children}</div>

        {footer && <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-base shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
