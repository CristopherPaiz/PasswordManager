import { InputHTMLAttributes, forwardRef, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, type = "text", ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";
    const resolvedType = isPassword && showPassword ? "text" : type;

    if (type === "file") {
      return (
        <div className={`space-y-2 ${className}`}>
          {label && (
            <label htmlFor={inputId} className="block text-sm font-semibold text-text-base">
              {label}
            </label>
          )}
          <input
            id={inputId}
            ref={ref}
            type="file"
            className="block w-full text-sm text-text-muted file:mr-4 file:py-2.5 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary-500 file:text-white hover:file:bg-primary-600 transition-colors cursor-pointer"
            {...props}
          />
          {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
        </div>
      );
    }

    return (
      <div className={`space-y-2 ${className}`}>
        {label && (
          <label htmlFor={inputId} className="block text-sm font-semibold text-text-base">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            type={resolvedType}
            className={`w-full px-4 py-3 ${isPassword ? "pr-12" : ""} bg-bg-base border ${error ? "border-red-500 focus:ring-red-500" : "border-border-base focus:ring-primary-500"} text-text-base rounded-xl focus:ring-2 focus:border-transparent outline-none transition-all`}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center pr-4 text-text-muted hover:text-text-base transition-colors cursor-pointer"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          )}
        </div>
        {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
      </div>
    );
  },
);

Input.displayName = "Input";
