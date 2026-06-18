import { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const Card = ({ children, className = "", ...props }: CardProps) => {
  return (
    <div className={`bg-surface p-8 rounded-2xl shadow-sm border border-border-base h-fit ${className}`} {...props}>
      {children}
    </div>
  );
};

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
}

export const CardTitle = ({ children, className = "", ...props }: CardTitleProps) => {
  return (
    <h2 className={`text-2xl font-bold text-text-base mb-6 ${className}`} {...props}>
      {children}
    </h2>
  );
};
