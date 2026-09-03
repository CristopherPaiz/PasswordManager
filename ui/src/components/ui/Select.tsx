import { SelectHTMLAttributes, forwardRef, useId, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: SelectOption[];
  placeholder?: string;
  children?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className = "", id, children, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;

    return (
      <div className={`space-y-1.5 ${className}`}>
        {label && (
          <label htmlFor={selectId} className="block text-caption font-medium text-text-muted">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            className={`w-full h-9 appearance-none px-3 pr-9 bg-bg-base border rounded-input text-body text-text-base outline-none transition-colors duration-100 cursor-pointer ${error ? "border-signal-danger focus:border-signal-danger focus:ring-2 focus:ring-signal-danger/20" : "border-border-base hover:border-border-strong focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"}`}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <ChevronDown className="w-4 h-4 text-text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        {error && <span className="text-caption text-signal-danger">{error}</span>}
      </div>
    );
  },
);

Select.displayName = "Select";
