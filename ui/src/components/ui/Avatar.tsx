type AvatarSize = "sm" | "md" | "lg";

const SIZES: Record<AvatarSize, string> = {
  sm: "w-6 h-6 text-caption",
  md: "w-8 h-8 text-caption",
  lg: "w-12 h-12 text-body",
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
    <div className={`${base} bg-bg-elevated text-text-muted font-medium border border-border-base`}>
      {getInitials(name)}
    </div>
  );
};
