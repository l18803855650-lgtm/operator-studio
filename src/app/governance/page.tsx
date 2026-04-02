import { GovernancePanel } from "@/components/governance-panel";
import { AiConnectionsPanel } from "@/components/ai-connections-panel";
import { BrowserProfilesPanel } from "@/components/browser-profiles-panel";
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
      <section className="section-card overflow-hidden p-6 md:p-8">
        <div className="rounded-[28px] bg-slate-950 p-7 text-white">
          <div className="section-kicker text-white/50">设置</div>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">把复杂项放到这里</h1>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            首页只管发起和查看，这一页专门收默认规则、API 连接和登录资料。
          </p>
        </div>
      </section>

      <GovernancePanel initialSettings={governance.settings} aiConnections={aiConnections} />
      <AiConnectionsPanel initialConnections={aiConnections} />
      <BrowserProfilesPanel initialProfiles={browserProfiles} />
    </main>
  );
}
