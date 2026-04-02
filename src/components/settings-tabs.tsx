"use client";

import { useState } from "react";
import type { GovernanceSettings } from "@/features/governance/governance.types";
import type { AiConnectionRecord } from "@/features/ai-connections/ai-connection.types";
import type { BrowserProfileRecord } from "@/features/browser-profiles/browser-profile.types";
import { GovernancePanel } from "@/components/governance-panel";
import { AiConnectionsPanel } from "@/components/ai-connections-panel";
import { BrowserProfilesPanel } from "@/components/browser-profiles-panel";

const tabs = [
  { key: "base", label: "基础" },
  { key: "api", label: "API" },
  { key: "browser", label: "浏览器" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export function SettingsTabs({
  initialSettings,
  aiConnections,
  browserProfiles,
}: {
  initialSettings: GovernanceSettings;
  aiConnections: AiConnectionRecord[];
  browserProfiles: BrowserProfileRecord[];
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("base");

  return (
    <section className="space-y-5">
      <div className="section-card p-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  active ? "bg-slate-950 text-white shadow-soft" : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "base" ? <GovernancePanel initialSettings={initialSettings} aiConnections={aiConnections} /> : null}
      {activeTab === "api" ? <AiConnectionsPanel initialConnections={aiConnections} /> : null}
      {activeTab === "browser" ? <BrowserProfilesPanel initialProfiles={browserProfiles} /> : null}
    </section>
  );
}
