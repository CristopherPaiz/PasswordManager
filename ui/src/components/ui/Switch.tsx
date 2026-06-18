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
          <span className="w-11 h-6 bg-border-base peer-checked:bg-primary-500 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg-surface" />
          <span className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-5" />
        </span>
        {label && <span className="text-sm font-medium text-text-base">{label}</span>}
      </label>
    );
  },
);

Switch.displayName = "Switch";
