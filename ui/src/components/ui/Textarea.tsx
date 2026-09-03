import { TextareaHTMLAttributes, forwardRef, useId } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", id, rows = 4, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;

    const border = error
      ? "border-signal-danger focus:border-signal-danger focus:ring-2 focus:ring-signal-danger/20"
      : "border-border-base hover:border-border-strong focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20";

    return (
      <div className={`space-y-1.5 ${className}`}>
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-caption font-medium text-text-muted"
          >
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          rows={rows}
          className={`w-full px-3 py-2 bg-bg-base border rounded-input text-body text-text-base placeholder:text-text-muted outline-none transition-colors duration-100 resize-y ${border}`}
          {...props}
        />
        {error && (
          <span className="text-caption text-signal-danger">{error}</span>
        )}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";
