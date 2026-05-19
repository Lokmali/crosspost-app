import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { InlineBadges } from "@/components/badges/inline-badges";
import { Button } from "@/components/ui/button";
import { useLeaderboardQuery } from "@/lib/api/leaderboard";
import { authClient } from "@/lib/auth-client";
import { getProfile } from "@/lib/utils/near-social-node";

export const Route = createFileRoute("/_layout/_authenticated/profile/")({
  component: ProfileIndexPage,
});

export function ProfileIndexPage() {
  const { data: session } = authClient.useSession();
  const accountId = session?.user?.id;
  const { data: leaderboard = [] } = useLeaderboardQuery(5);
  const { data: profile } = useQuery({
    queryKey: ["near-profile", accountId],
    queryFn: () => getProfile(accountId as string),
    enabled: !!accountId,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg border p-5">
        <h1 className="text-2xl font-bold">Profile Center</h1>
        {!accountId ? (
          <p className="mt-2 text-muted-foreground">Sign in to view your profile and leaderboard progress.</p>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">{accountId}</span>
              <InlineBadges accountId={accountId} />
            </div>
            <p className="text-sm text-muted-foreground">
              {(profile as { name?: string } | null)?.name
                ? `Display name: ${(profile as { name?: string }).name}`
                : "No display name found on Near Social profile."}
            </p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          {accountId ? (
            <Button asChild>
              <Link to="/profile/$accountId" params={{ accountId }}>
                Open Full Profile
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to="/leaderboard">Open Leaderboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/manage">Manage Connected Accounts</Link>
          </Button>
        </div>
      </div>

      <div className="rounded-lg border p-5">
        <h2 className="text-lg font-semibold">Top Accounts</h2>
        {leaderboard.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No leaderboard data yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {leaderboard.map((entry, index) => (
              <div key={`${entry.signerId}-${index}`} className="flex items-center justify-between text-sm">
                <Link
                  to="/profile/$accountId"
                  params={{ accountId: entry.signerId }}
                  className="font-medium text-primary hover:underline"
                >
                  {entry.signerId}
                </Link>
                <span className="text-muted-foreground">Posts {entry.postCount ?? 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
