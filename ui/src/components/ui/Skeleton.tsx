import { HTMLAttributes } from "react";

// Placeholder de carga. Úsalo como PRIMERA opción de loading (mejor UX que un spinner):
// reserva el espacio del contenido real para evitar saltos de layout.
export const Skeleton = ({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={`animate-pulse rounded-badge bg-border-base ${className}`}
      {...props}
    />
  );
};
