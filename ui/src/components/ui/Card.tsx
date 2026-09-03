import { HTMLAttributes, ReactNode } from "react";

/**
 * Superficie al estilo Linear: borde hairline, sin sombra, padding contenido.
 * La jerarquía la da la rampa (bg-base < bg-surface < bg-elevated), no el relieve.
 */

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const Card = ({ children, className = "", ...props }: CardProps) => {
  return (
    <div className={`bg-bg-surface p-5 rounded-card border border-border-base h-fit ${className}`} {...props}>
      {children}
    </div>
  );
};

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
}

export const CardTitle = ({ children, className = "", ...props }: CardTitleProps) => {
  return (
    <h2 className={`text-title font-medium text-text-base mb-4 ${className}`} {...props}>
      {children}
    </h2>
  );
};
