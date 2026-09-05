import { cn, initialsOf } from "@/lib/ui";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface AvatarProps {
  /** Username or display name; drives the initials fallback and alt text. */
  name: string;
  src?: string | null;
  size?: AvatarSize;
  /**
   * Marks audio that is live or unheard for this person. This is one of the
   * five places Signal is allowed to appear (§4.1) — never use it to decorate.
   */
  ring?: boolean;
  className?: string;
}

/**
 * Squircles, not circles (§8.10). The person is a label on the rail, not a
 * bubble, and the radius grows with the square so every avatar shares one
 * corner curvature rather than one corner radius.
 */
const SIZES: Record<AvatarSize, string> = {
  xs: "size-6 rounded-[7px] text-[0.5625rem]",
  sm: "size-8 rounded-[12px] text-[0.75rem]",
  md: "size-11 rounded-[15px] text-[0.9375rem]",
  lg: "size-12 rounded-[16px] text-[1rem]",
  xl: "size-16 rounded-[20px] text-[1.375rem]",
};

export function Avatar({ name, src, size = "md", ring = false, className }: AvatarProps) {
  const initials = initialsOf(name);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden",
        // Fallback initials: Archivo 500, ink-muted on paper-sunk (§8.10).
        "bg-paper-sunk font-medium text-ink-muted select-none",
        ring && "outline-2 outline-offset-2 outline-signal",
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
