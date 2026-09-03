export interface DaySeparatorProps {
  label: string;
}

/** Day-divider pill inside a thread ("Today" / "Yesterday" / a full date). */
export function DaySeparator({ label }: DaySeparatorProps) {
  return (
    <div role="separator" aria-label={label} className="flex items-center justify-center py-3">
      <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-fg-subtle">
        {label}
      </span>
    </div>
  );
}
