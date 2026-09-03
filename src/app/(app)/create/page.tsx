import { Mic } from "lucide-react";

import { TERMS } from "@/config/terminology";

import { PlaceholderPage } from "../_components/PlaceholderPage";

export const metadata = { title: `${TERMS.create} ${TERMS.aWave}` };

/** Create: record in the app or upload an existing file (spec 17, 18). */
export default function CreatePage() {
  return (
    <PlaceholderPage
      title={`${TERMS.create} ${TERMS.aWave}`}
      description={`${TERMS.record} straight into ${TERMS.brand}, or ${TERMS.upload.toLowerCase()} audio you already have.`}
      icon={<Mic className="size-6" />}
      emptyTitle="The recorder is not wired up yet"
      emptyDescription={`Recording and upload arrive with the audio infrastructure stage. Both paths produce a ${TERMS.wave}: one marked ${TERMS.recorded}, the other ${TERMS.uploaded}.`}
    />
  );
}
