import { AudioLines } from "lucide-react";

import { TERMS } from "@/config/terminology";

import { PlaceholderPage } from "../../_components/PlaceholderPage";

interface WavePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: WavePageProps) {
  const { id } = await params;
  return { title: `${TERMS.wave} ${id}` };
}

/** Wave detail: the full card, its comments and its Duet tree (spec 11, 15). */
export default async function WavePage({ params }: WavePageProps) {
  const { id } = await params;

  return (
    <PlaceholderPage
      title={TERMS.wave}
      description={`${TERMS.wave} ${id}`}
      icon={<AudioLines className="size-6" />}
      emptyTitle={`This ${TERMS.wave} is not available yet`}
      emptyDescription={`${TERMS.wave} detail arrives with the Waves stage, including ${TERMS.comments.toLowerCase()} and the ${TERMS.duet} tree that grew from it.`}
    />
  );
}
