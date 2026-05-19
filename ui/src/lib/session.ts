import { queryOptions } from "@tanstack/react-query";
import { authClient, type SessionData } from "./auth-client";

export type { SessionData };

export type User = NonNullable<SessionData["user"]>;
export type SessionInfo = NonNullable<SessionData["session"]>;

export const sessionQueryOptions = (initialSession?: SessionData | null) =>
  queryOptions({
    queryKey: ["session"],
    queryFn: async () => {
      const { data: session } = await authClient.getSession();
      return session;
    },
    staleTime: 15 * 1000,
    gcTime: 10 * 60 * 1000,
    initialData: initialSession,
  });

export function getSessionFromData(session: SessionData | null | undefined) {
  if (!session?.user) {
    return {
      isAuthenticated: false,
      user: null,
      session: null,
      activeOrganizationId: null,
      isAnonymous: false,
      isAdmin: false,
      isBanned: false,
    };
  }

  const orgSession = session.session as SessionInfo & { activeOrganizationId?: string | null };

  return {
    isAuthenticated: true,
    user: session.user,
    session: session.session,
    activeOrganizationId: orgSession.activeOrganizationId ?? null,
    isAnonymous: session.user.isAnonymous || false,
    isAdmin: session.user.role === "admin",
    isBanned: session.user.banned || false,
  };
}

export async function signOut() {
  await authClient.signOut();
  await authClient.near.disconnect().catch(() => {});
}

export async function updateProfile(name: string) {
  const { error } = await authClient.updateUser({ name });
  if (error) throw new Error(error.message);
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const { error } = await authClient.changePassword({
    currentPassword,
    newPassword,
  });
  if (error) throw new Error(error.message);
}

export async function revokeOtherSessions() {
  const { error } = await authClient.revokeSessions();
  if (error) throw new Error(error.message);
}

export async function linkNearWallet() {
  await new Promise<void>((resolve, reject) => {
    authClient.signIn.near({
      onSuccess: () => resolve(),
      onError: (error) => reject(error),
    });
  });
}

export async function ensureNearWalletConnectedForSigning() {
  if (authClient.near.getAccountId?.()) {
    return;
  }
  await linkNearWallet();
  if (!authClient.near.getAccountId?.()) {
    throw new Error(
      "Your NEAR wallet is not connected in this browser. Approve the wallet prompt or use Sign in with NEAR again, then retry.",
    );
  }
}
