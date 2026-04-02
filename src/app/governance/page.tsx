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
      <section className="section-card overflow-hidden p-8">
        <div>
          <div className="section-kicker">Settings & Connections</div>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950">
            默认规则、AI 连接和凭据资料库都放在这里
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
            把默认生命周期、并发、视觉验收要求、用户自己的 API 连接，以及 Browser 登录凭据都收在一页。目标不是参数越多越强，
            而是让别人第一次打开就能接上、跑起来。
          </p>
        </div>
      </section>

      <GovernancePanel initialSettings={governance.settings} aiConnections={aiConnections} />
      <AiConnectionsPanel initialConnections={aiConnections} />
      <BrowserProfilesPanel initialProfiles={browserProfiles} />
    </main>
  );
}
