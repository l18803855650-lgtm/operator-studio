import { SettingsTabs } from "@/components/settings-tabs";
import { getGovernanceStatus } from "@/features/governance/governance.service";
import { listBrowserProfiles } from "@/features/browser-profiles/browser-profile.service";
import { listAiConnections } from "@/features/ai-connections/ai-connection.service";
import { requirePageSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  await requirePageSession();
  const [governance, browserProfiles, aiConnections] = await Promise.all([
    getGovernanceStatus(),
    listBrowserProfiles(),
    listAiConnections(),
  ]);

  return (
    <main className="page-shell space-y-6">
      <section className="section-card p-6 md:p-7">
        <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">设置</h1>
      </section>

      <SettingsTabs
        initialSettings={governance.settings}
        aiConnections={aiConnections}
        browserProfiles={browserProfiles}
      />
    </main>
  );
}
