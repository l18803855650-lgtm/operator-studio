import { redirect } from "next/navigation";
import { AuthPanel } from "@/components/auth-panel";
import { getCurrentPageSession } from "@/lib/auth";
import { getBootstrapStatus } from "@/features/auth/auth.service";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getCurrentPageSession();
  if (session) {
    redirect("/");
  }
  const status = await getBootstrapStatus(null);
  return <AuthPanel requiresSetup={status.requiresSetup} />;
}
