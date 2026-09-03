import { Mic } from "lucide-react";
import Link from "next/link";

import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";

import { PlaceholderPage } from "./_components/PlaceholderPage";

export const metadata = { title: TERMS.home };

/** Home: the personalised feed of Waves from creators you follow (spec 9). */
export default async function HomePage() {
  await requireUser(routes.home());

  return (
    <PlaceholderPage
      title={TERMS.home}
      description={`${TERMS.waves} from the creators you follow.`}
      icon={<Mic className="size-6" />}
      emptyTitle="Your feed is quiet"
      emptyDescription={`Follow a few creators and their ${TERMS.waves} land here. Not sure where to start? ${TERMS.explore} has the rest of the network.`}
      action={
        <Link href={routes.explore()} className="text-sm font-medium text-accent underline underline-offset-2">
          Go to {TERMS.explore}
        </Link>
      }
      secondaryAction={
        <Link href={routes.create()} className="text-sm font-medium text-fg-muted underline underline-offset-2">
          {TERMS.create} {TERMS.aWave}
        </Link>
      }
    />
  );
}
