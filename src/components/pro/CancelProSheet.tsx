"use client";

import { useState } from "react";

import { cancelPro } from "@/app/(app)/settings/pro/actions";
import { Button, Sheet } from "@/components/ui";
import { formatAbsoluteTime } from "@/lib/ui";

export interface CancelProSheetProps {
  open: boolean;
  onClose: () => void;
  currentPeriodEnd: string | null;
  /** Called after a real, confirmed cancellation — the caller flips its own local state, never before this fires. */
  onCanceled: () => void;
}

/**
 * The confirm Sheet behind "Cancel at period end" (active state,
 * `docs/BILLING.md` "Cancel / refund policy"): danger text only, no red
 * pill, no coloured card. Cancelling never ends access immediately — this
 * copy says exactly that, so nothing here reads as more final than it is.
 */
export function CancelProSheet({ open, onClose, currentPeriodEnd, onCanceled }: CancelProSheetProps) {
  const [canceling, setCanceling] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const close = () => {
    if (canceling) return;
    setFormError(null);
    onClose();
  };

  const handleConfirm = () => {
    setCanceling(true);
    setFormError(null);
    void cancelPro().then((result) => {
      setCanceling(false);
      if (!result.ok) {
        setFormError(result.formError ?? "We couldn't cancel your subscription. Try again.");
        return;
      }
      onCanceled();
    });
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Cancel AKINTI Pro"
      description={
        currentPeriodEnd
          ? `Pitch snap, self-harmony, stems and your other Pro options stay available until ${formatAbsoluteTime(currentPeriodEnd)}.`
          : "Your Pro options stay available until the end of the current billing period."
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={canceling}>
            Keep AKINTI Pro
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={canceling}>
            Cancel at period end
          </Button>
        </div>
      }
    >
      {formError ? (
        <p role="alert" className="type-body-sm text-danger">
          {formError}
        </p>
      ) : null}
    </Sheet>
  );
}
