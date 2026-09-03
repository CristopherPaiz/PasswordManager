import { ButtonHTMLAttributes, ReactNode, ElementType } from "react";
import { Link, LinkProps } from "react-router";
import { useTranslation } from "react-i18next";

/**
 * Botón al estilo Linear: compacto, borde hairline de 1px, cero sombras.
 * Linear separa superficies con borde y tono de la rampa, nunca con `shadow`;
 * una sombra sobre un canvas casi negro solo ensucia.
 */

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface BaseButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  icon?: ElementType;
  iconRight?: ElementType;
  className?: string;
}

// Alturas fijas: en una UI densa las filas deben alinearse entre sí.
const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-caption gap-1.5",
  md: "h-8 px-3.5 text-caption gap-1.5",
  lg: "h-10 px-4 text-body gap-2",
};

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-4 h-4",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary-500 text-white border border-primary-500 hover:bg-primary-600 hover:border-primary-600",
  secondary: "bg-bg-surface text-text-base border border-border-base hover:bg-bg-elevated hover:border-border-strong",
  danger: "bg-transparent text-signal-danger border border-signal-danger/30 hover:bg-signal-danger/10 hover:border-signal-danger/50",
  ghost: "bg-transparent text-text-muted border border-transparent hover:bg-bg-elevated hover:text-text-base",
};

const getButtonClasses = ({ variant = "primary", size = "md", isLoading = false, className = "" }: BaseButtonProps) => {
  const base =
    "inline-flex items-center justify-center font-medium rounded-button transition-colors duration-100 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-40 disabled:cursor-not-allowed";
  return `${base} ${VARIANTS[variant]} ${SIZES[size]} ${isLoading ? "cursor-wait" : ""} ${className}`;
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, BaseButtonProps {
  children: ReactNode;
}

export const Button = ({ children, variant = "primary", size = "md", isLoading = false, icon: Icon, iconRight: IconRight, className = "", disabled, ...props }: ButtonProps) => {
  const { t } = useTranslation();
  const iconSize = ICON_SIZES[size];

  return (
    <button disabled={disabled || isLoading} className={getButtonClasses({ variant, size, isLoading, className })} {...props}>
      {isLoading ? (
        <>
          <svg className={`animate-spin ${iconSize} text-current`} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>{t("common.loading")}</span>
        </>
      ) : (
        <>
          {Icon && <Icon className={iconSize} />}
          <span>{children}</span>
          {IconRight && <IconRight className={iconSize} />}
        </>
      )}
    </button>
  );
};

interface LinkButtonProps extends LinkProps, BaseButtonProps {
  children: ReactNode;
}

export const LinkButton = ({ children, variant = "primary", size = "md", icon: Icon, iconRight: IconRight, className = "", ...props }: LinkButtonProps) => {
  const iconSize = ICON_SIZES[size];
  return (
    <Link className={getButtonClasses({ variant, size, className })} {...props}>
      {Icon && <Icon className={iconSize} />}
      <span>{children}</span>
      {IconRight && <IconRight className={iconSize} />}
    </Link>
  );
};
