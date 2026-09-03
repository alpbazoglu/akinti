"use client";

import { useState } from "react";
import { AudioLines, Handshake, Mic } from "lucide-react";

import { TERMS } from "@/config/terminology";
import { routes } from "@/config/routes";
import { WaveCard, type WaveCardWave } from "@/components/wave";
import { Button, EmptyState, TabPanel, Tabs, tabId, tabPanelId } from "@/components/ui";

export interface ProfileTabsProps {
  waves: WaveCardWave[];
  duets: WaveCardWave[];
  isSelf: boolean;
  username: string;
}

const ID_PREFIX = "profile-tabs";

/** Profile → Waves / Duets tabs (spec §21). Presentation only — data arrives pre-hydrated from the page. */
export function ProfileTabs({ waves, duets, isSelf, username }: ProfileTabsProps) {
  const [tab, setTab] = useState<"waves" | "duets">("waves");

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 sm:px-5">
      <Tabs
        idPrefix={ID_PREFIX}
        label="Profile content"
        value={tab}
        onValueChange={(value) => setTab(value as "waves" | "duets")}
        items={[
          { value: "waves", label: TERMS.waves, count: waves.length },
          { value: "duets", label: TERMS.duets, count: duets.length },
        ]}
      />

      <TabPanel
        id={tabPanelId(ID_PREFIX, "waves")}
        labelledBy={tabId(ID_PREFIX, "waves")}
        active={tab === "waves"}
      >
        {waves.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<AudioLines className="size-5" />}
            title={isSelf ? `You haven't published a ${TERMS.wave.toLowerCase()} yet` : `No ${TERMS.waves.toLowerCase()} yet`}
            description={isSelf ? "Record or upload your first Wave to get started." : undefined}
            action={
              isSelf ? (
                <Button
                  size="sm"
                  leadingIcon={<Mic className="size-4" />}
                  onClick={() => {
                    window.location.href = routes.create();
                  }}
                >
                  {TERMS.record}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {waves.map((wave) => (
              <WaveCard key={wave.id} wave={wave} />
            ))}
          </div>
        )}
      </TabPanel>

      <TabPanel
        id={tabPanelId(ID_PREFIX, "duets")}
        labelledBy={tabId(ID_PREFIX, "duets")}
        active={tab === "duets"}
      >
        {duets.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<Handshake className="size-5" />}
            title={`No ${TERMS.duets.toLowerCase()} yet`}
            description={
              isSelf
                ? `Duets you publish will show up here, credited back to the original ${TERMS.wave.toLowerCase()}.`
                : `@${username} hasn't published a ${TERMS.duet.toLowerCase()} yet.`
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {duets.map((wave) => (
              <WaveCard key={wave.id} wave={wave} />
            ))}
          </div>
        )}
      </TabPanel>
    </div>
  );
}
