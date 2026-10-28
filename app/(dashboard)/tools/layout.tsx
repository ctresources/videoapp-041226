import { isPaidLevel } from "@/lib/access";
import { getServerAccess } from "@/lib/access-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeRunsUsed } from "@/lib/utils/free-trial";
import { aiImagesUsedThisMonth } from "@/lib/utils/image-allowance";
import { toolsState } from "@/lib/tools-access";
import { LockedFeature } from "@/components/access/locked-feature";

/**
 * Spark Tools (2026-10-28, the owner's rule): paid plans always; a free
 * account while its free-plan allowance lasts (lib/tools-access.ts) — 2 tries
 * and 2 AI images before the free video, then 14 days unlimited after it.
 * Once that is spent, the locked card instead of the page. Each tool's route
 * still enforces the same allowance on the server, and the workflow tools
 * inside (Seller Update, review video email, Google Reviews) stay paid-only
 * on the page and in middleware.ts.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { level, userId } = await getServerAccess();
  if (isPaidLevel(level) || !userId) return <>{children}</>;

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("subscription_tier, first_video_generated_at")
    .eq("id", userId)
    .single();
  const p = data as { subscription_tier: string | null; first_video_generated_at: string | null } | null;
  const [runsUsed, imagesUsed] = p?.first_video_generated_at
    ? [0, 0]
    : await Promise.all([freeRunsUsed(userId), aiImagesUsedThisMonth(admin, userId)]);

  const state = toolsState({
    paid: false, tier: p?.subscription_tier, firstVideoAt: p?.first_video_generated_at, runsUsed, imagesUsed,
  });
  if (state === "open") return <>{children}</>;

  return (
    <div className="py-6">
      {state === "spent_pre_video" ? (
        <LockedFeature
          feature="Spark Tools"
          title="You've used your free tries"
          body="Make your free video to use Spark Tools free for 14 days, or unlock everything with a SparkReels plan."
          secondary={{ href: "/create", label: "Make my free video" }}
        />
      ) : (
        <LockedFeature
          feature="Spark Tools"
          body="Your free Spark Tools days have ended. Unlock every tool and the complete SparkReels workflow with a paid plan."
        />
      )}
    </div>
  );
}
