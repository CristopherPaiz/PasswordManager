import { HTMLAttributes, ReactNode } from "react";

/**
 * Badge al estilo Linear: chip neutro de la rampa con un PUNTO de color, en vez
 * del bloque tintado. Linear reserva el color saturado para la señal misma, no
 * para el fondo — así diez badges en una lista no compiten con el contenido.
 */

type BadgeVariant = "primary" | "success" | "danger" | "warning" | "neutral";

const DOTS: Record<BadgeVariant, string> = {
  primary: "bg-primary-500",
  success: "bg-signal-success",
  danger: "bg-signal-danger",
  warning: "bg-signal-accent",
  neutral: "bg-text-muted",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
  /** Oculta el punto cuando el texto ya basta (p. ej. un contador). */
  dot?: boolean;
}

export const Badge = ({
  variant = "neutral",
  dot = true,
  className = "",
  children,
  ...props
}: BadgeProps) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-badge text-caption font-medium bg-bg-elevated text-text-base border border-border-base ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOTS[variant]}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
};
