import { InputHTMLAttributes, forwardRef, useId } from "react";

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = "", id, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id ?? generatedId;

    return (
      <label
        htmlFor={checkboxId}
        className="inline-flex items-center gap-2 cursor-pointer select-none"
      >
        <input
          id={checkboxId}
          ref={ref}
          type="checkbox"
          className={`w-3.5 h-3.5 rounded-badge border border-border-base bg-bg-base accent-primary-500 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer ${className}`}
          {...props}
        />
        {label && <span className="text-body text-text-base">{label}</span>}
      </label>
    );
  },
);

Checkbox.displayName = "Checkbox";
