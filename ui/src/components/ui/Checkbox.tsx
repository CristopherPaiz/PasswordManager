import { InputHTMLAttributes, forwardRef, useId } from "react";

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = "", id, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id ?? generatedId;

    return (
      <label htmlFor={checkboxId} className="inline-flex items-center gap-2.5 cursor-pointer select-none">
        <input
          id={checkboxId}
          ref={ref}
          type="checkbox"
          className={`w-4 h-4 rounded border-border-base text-primary-500 bg-bg-base focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer accent-primary-500 ${className}`}
          {...props}
        />
        {label && <span className="text-sm font-medium text-text-base">{label}</span>}
      </label>
    );
  },
);

Checkbox.displayName = "Checkbox";
