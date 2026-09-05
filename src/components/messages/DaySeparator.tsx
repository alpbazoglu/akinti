export interface DaySeparatorProps {
  label: string;
}

/**
 * Day divider inside a thread ("Today" / "Yesterday" / a full date):
 * SCREENS.md §9.2 draws it as a centred caption between two hairlines, never
 * a pill (§12.4).
 */
export function DaySeparator({ label }: DaySeparatorProps) {
  return (
    <div role="separator" aria-label={label} className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
      <span className="type-caption shrink-0 text-ink-subtle">{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
    </div>
  );
}
