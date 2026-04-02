import { GovernancePanel } from "@/components/governance-panel";
import { BrowserProfilesPanel } from "@/components/browser-profiles-panel";
import { getGovernanceStatus } from "@/features/governance/governance.service";
import { listBrowserProfiles } from "@/features/browser-profiles/browser-profile.service";
import { requirePageSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  await requirePageSession();
  const [governance, browserProfiles] = await Promise.all([getGovernanceStatus(), listBrowserProfiles()]);
  return (
    <main className="page-shell space-y-6">
      <GovernancePanel initial={governance} />
      <BrowserProfilesPanel initialProfiles={browserProfiles} />
    </main>
  );
}
