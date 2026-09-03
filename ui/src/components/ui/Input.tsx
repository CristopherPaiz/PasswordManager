import { InputHTMLAttributes, forwardRef, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Campo al estilo Linear: "inset" — el input es MÁS oscuro que la superficie que
 * lo contiene (bg-base dentro de una Card en bg-surface), con borde hairline.
 * El foco cambia el borde y añade un halo tenue; nada de anillos de 2px.
 */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const FIELD =
  "w-full h-9 px-3 bg-bg-base border rounded-input text-body text-text-base placeholder:text-text-muted outline-none transition-colors duration-100";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, type = "text", ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";
    const resolvedType = isPassword && showPassword ? "text" : type;

    const border = error
      ? "border-signal-danger focus:border-signal-danger focus:ring-2 focus:ring-signal-danger/20"
      : "border-border-base hover:border-border-strong focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20";

    if (type === "file") {
      return (
        <div className={`space-y-1.5 ${className}`}>
          {label && (
            <label
              htmlFor={inputId}
              className="block text-caption font-medium text-text-muted"
            >
              {label}
            </label>
          )}
          <input
            id={inputId}
            ref={ref}
            type="file"
            className="block w-full text-caption text-text-muted file:mr-3 file:h-8 file:px-3 file:rounded-button file:border file:border-border-base file:bg-bg-elevated file:text-caption file:font-medium file:text-text-base hover:file:border-border-strong transition-colors cursor-pointer"
            {...props}
          />
          {error && (
            <span className="text-caption text-signal-danger">{error}</span>
          )}
        </div>
      );
    }

    return (
      <div className={`space-y-1.5 ${className}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-caption font-medium text-text-muted"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            type={resolvedType}
            className={`${FIELD} ${isPassword ? "pr-10" : ""} ${border}`}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-muted hover:text-text-base transition-colors cursor-pointer"
              aria-label={
                showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
              }
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
        {error && (
          <span className="text-caption text-signal-danger">{error}</span>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
