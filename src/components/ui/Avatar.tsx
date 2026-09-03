import { cn, initialsOf } from "@/lib/ui";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface AvatarProps {
  /** Username or display name; drives the initials fallback and alt text. */
  name: string;
  src?: string | null;
  size?: AvatarSize;
  /** Ring treatment used to mark the active speaker on a Wave card. */
  ring?: boolean;
  className?: string;
}

const SIZES: Record<AvatarSize, string> = {
  xs: "size-6 text-[0.625rem]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
  xl: "size-20 text-xl",
};

export function Avatar({ name, src, size = "md", ring = false, className }: AvatarProps) {
  const initials = initialsOf(name);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "bg-surface-inset font-semibold text-fg-muted select-none",
        ring && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
        SIZES[size],
        className,
      )}
    >
      {src ? (
        // Avatars come from user storage at arbitrary sizes; a plain <img> keeps
        // this component free of loader configuration.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
      {src ? null : <span className="sr-only">{name}</span>}
    </span>
  );
}
