import { InputHTMLAttributes, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";

interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "defaultValue"> {
  // Se llama con el valor YA debounced (no en cada tecla).
  onSearch: (value: string) => void;
  delay?: number;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}

export const SearchBar = ({ onSearch, delay = 400, defaultValue = "", placeholder, className = "", ...props }: SearchBarProps) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue);

  // Ref para no meter onSearch en deps (evita reiniciar el timer si el padre
  // re-renderiza con una función nueva en cada render).
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  // Salta el primer render para no disparar la búsqueda con el valor inicial.
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => onSearchRef.current(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return (
    <div className="relative w-full">
      <Search className="w-5 h-5 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? t("search.placeholder")}
        className={`w-full pl-11 pr-10 py-3 bg-bg-base border border-border-base text-text-base rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all [&::-webkit-search-cancel-button]:hidden ${className}`}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-text-base transition-colors cursor-pointer"
          aria-label={t("search.clear")}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
