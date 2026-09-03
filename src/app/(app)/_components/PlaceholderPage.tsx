import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";

export interface PlaceholderPageProps {
  title: string;
  description?: ReactNode;
  emptyTitle: string;
  emptyDescription: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
}

/**
 * Stage 1 scaffold. Each route renders its real title plus the empty state it
 * will keep once the feature agent fills it in — so the shell, routing and
 * empty states are real, and nothing here pretends a feature exists.
 */
export function PlaceholderPage({
  title,
  description,
  emptyTitle,
  emptyDescription,
  icon,
  action,
  secondaryAction,
}: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        icon={icon}
        action={action}
        secondaryAction={secondaryAction}
      />
    </>
  );
}
