type AvatarSize = "sm" | "md" | "lg";

const SIZES: Record<AvatarSize, string> = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-lg",
};

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: AvatarSize;
  className?: string;
}

const getInitials = (name?: string | null): string => {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};

export const Avatar = ({ src, name, size = "md", className = "" }: AvatarProps) => {
  const base = `${SIZES[size]} rounded-full flex items-center justify-center shrink-0 overflow-hidden ${className}`;

  if (src) {
    return <img src={src} alt={name ?? "avatar"} className={`${base} object-cover`} />;
  }

  return (
    <div className={`${base} bg-primary-50 dark:bg-primary-900/20 text-primary-500 font-semibold border border-primary-100 dark:border-primary-800`}>
      {getInitials(name)}
    </div>
  );
};
