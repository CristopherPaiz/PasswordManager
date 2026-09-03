import { InputHTMLAttributes, forwardRef, useId } from "react";

interface SwitchProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, className = "", id, ...props }, ref) => {
    const generatedId = useId();
    const switchId = id ?? generatedId;

    return (
      <label htmlFor={switchId} className="inline-flex items-center gap-3 cursor-pointer select-none">
        <span className="relative inline-flex">
          <input id={switchId} ref={ref} type="checkbox" className={`peer sr-only ${className}`} {...props} />
          <span className="w-9 h-5 bg-border-strong peer-checked:bg-primary-500 rounded-full transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/40" />
          <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-150 peer-checked:translate-x-4" />
        </span>
        {label && <span className="text-body text-text-base">{label}</span>}
      </label>
    );
  },
);

Switch.displayName = "Switch";
