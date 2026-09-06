"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Mic } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { WaveCardContainer, type WaveCardContainerWave } from "@/components/wave";
import { Button, EmptyState, TabPanel, Tabs, tabId, tabPanelId } from "@/components/ui";

export interface ProfileTabsProps {
  waves: WaveCardContainerWave[];
  duets: WaveCardContainerWave[];
  isSelf: boolean;
  username: string;
}

const ID_PREFIX = "profile-tabs";

/** Profile → Waves / Duets tabs (spec §21). Presentation only — data arrives pre-hydrated from the page. */
export function ProfileTabs({ waves, duets, isSelf, username }: ProfileTabsProps) {
  const [tab, setTab] = useState<"waves" | "duets">("waves");
  const t = useTranslations("ProfileTabs");
  const tTerms = useTranslations("Terms");

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 sm:px-5">
      <Tabs
        idPrefix={ID_PREFIX}
        label={t("tabsLabel")}
        value={tab}
        onValueChange={(value) => setTab(value as "waves" | "duets")}
        items={[
          { value: "waves", label: tTerms("waves"), count: waves.length },
          { value: "duets", label: tTerms("duets"), count: duets.length },
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
            title={isSelf ? t("noWavesSelf") : t("noWavesOther")}
            description={isSelf ? t("recordCta") : undefined}
            action={
              isSelf ? (
                <Button
                  size="sm"
                  leadingIcon={<Mic className="size-4" />}
                  onClick={() => {
                    window.location.href = routes.create();
                  }}
                >
                  {tTerms("record")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {waves.map((wave) => (
              <WaveCardContainer key={wave.id} wave={wave} />
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
            title={t("noDuets")}
            description={isSelf ? t("duetsDescriptionSelf") : t("duetsDescriptionOther", { username })}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {duets.map((wave) => (
              <WaveCardContainer key={wave.id} wave={wave} />
            ))}
          </div>
        )}
      </TabPanel>
    </div>
  );
}
