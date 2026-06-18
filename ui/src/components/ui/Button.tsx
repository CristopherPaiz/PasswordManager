import { ButtonHTMLAttributes, ReactNode, ElementType } from "react";
import { Link, LinkProps } from "react-router";
import { useTranslation } from "react-i18next";

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

const getButtonClasses = ({ variant = "primary", size = "md", isLoading = false, className = "" }: BaseButtonProps) => {
  const baseClasses = "inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary: "bg-primary-500 text-white hover:bg-primary-600 shadow-md shadow-primary-500/20",
    secondary: "bg-surface border border-border-base text-text-base hover:bg-bg-base shadow-sm",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20",
    ghost: "bg-transparent text-text-muted hover:bg-bg-base hover:text-text-base",
  };

  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  const loadingClasses = isLoading ? "opacity-70 cursor-wait" : "";

  return `${baseClasses} ${variants[variant]} ${sizes[size]} ${loadingClasses} ${className}`;
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, BaseButtonProps {
  children: ReactNode;
}

export const Button = ({ children, variant = "primary", size = "md", isLoading = false, icon: Icon, iconRight: IconRight, className = "", disabled, ...props }: ButtonProps) => {
  const { t } = useTranslation();
  return (
    <button disabled={disabled || isLoading} className={getButtonClasses({ variant, size, isLoading, className })} {...props}>
      {isLoading ? (
        <>
          <svg className="animate-spin h-5 w-5 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>{t("common.loading")}</span>
        </>
      ) : (
        <>
          {Icon && <Icon className="w-5 h-5" />}
          <span>{children}</span>
          {IconRight && <IconRight className="w-5 h-5" />}
        </>
      )}
    </button>
  );
};

interface LinkButtonProps extends LinkProps, BaseButtonProps {
  children: ReactNode;
}

export const LinkButton = ({ children, variant = "primary", size = "md", icon: Icon, iconRight: IconRight, className = "", ...props }: LinkButtonProps) => {
  return (
    <Link className={getButtonClasses({ variant, size, className })} {...props}>
      {Icon && <Icon className="w-5 h-5" />}
      <span>{children}</span>
      {IconRight && <IconRight className="w-5 h-5" />}
    </Link>
  );
};
