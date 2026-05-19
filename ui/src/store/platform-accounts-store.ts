import type { ConnectedAccount, Platform } from "@crosspost/plugin/types";
import { getErrorMessage } from "@crosspost/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/auth-client";
import { createAuthenticatedMutation } from "@/lib/authentication-service";
import { getClient } from "@/lib/authorization-service";
import { resolveLinkedNearAccountId, signMessage } from "@/lib/near";
import { getNearWalletDisplayFromSession } from "@/lib/near-session-display";
import { linkNearWallet } from "@/lib/session";
import { getImageUrl, getProfile } from "@/lib/utils/near-social-node";

interface PlatformAccountsState {
  selectedAccountIds: string[];
  selectAccount: (userId: string) => void;
  unselectAccount: (userId: string) => void;
  toggleAccountSelection: (userId: string) => void;
  clearSelectedAccounts: () => void;
  isAccountSelected: (userId: string) => boolean;
}

export const usePlatformAccountsStore = create<PlatformAccountsState>()(
  persist(
    (set, get) => ({
      selectedAccountIds: [],

      selectAccount: (userId) => {
        set((state) => ({
          selectedAccountIds: state.selectedAccountIds.includes(userId)
            ? state.selectedAccountIds
            : [...state.selectedAccountIds, userId],
        }));
      },

      unselectAccount: (userId) => {
        set((state) => ({
          selectedAccountIds: state.selectedAccountIds.filter((id) => id !== userId),
        }));
      },

      toggleAccountSelection: (userId) => {
        const state = get();
        if (state.selectedAccountIds.includes(userId)) {
          state.unselectAccount(userId);
        } else {
          state.selectAccount(userId);
        }
      },

      isAccountSelected: (userId) => {
        return get().selectedAccountIds.includes(userId);
      },

      clearSelectedAccounts: () => {
        set({ selectedAccountIds: [] });
      },
    }),
    {
      name: "crosspost-selected-accounts",
      storage: createJSONStorage(() => localStorage), // Use localStorage for persistence across browser sessions
    },
  ),
);

export function useConnectedAccounts() {
  const { data: session } = authClient.useSession();
  const sessionNearId = getNearWalletDisplayFromSession(session);
  const currentAccountId = sessionNearId ?? session?.user?.id ?? null;
  const isSignedIn = !!session?.user;
  const { toast } = useToast();

  return useQuery({
    queryKey: ["connectedAccounts", currentAccountId],
    queryFn: async () => {
      const accountId = (await resolveLinkedNearAccountId()) ?? sessionNearId;

      if (!accountId) {
        throw new Error("No NEAR account connected. Please connect your wallet and try again.");
      }
      try {
        const client = getClient();
        const accountAwareClient = client as {
          setAccountHeader?: (id: string) => void;
          setAccountId?: (id: string) => void;
          setNearAccount?: (id: string) => void;
        };
        accountAwareClient.setAccountHeader?.(accountId);
        accountAwareClient.setAccountId?.(accountId);
        accountAwareClient.setNearAccount?.(accountId);

        const response = await client.auth.getConnectedAccounts();

        if (response.success && response.data) {
          // Ensure accounts is an array and filter out any malformed entries
          return response.data.accounts || [];
        } else {
          const errorMessage = response.errors?.length
            ? response.errors[0].message
            : "Unknown error occurred";
          throw new Error(errorMessage);
        }
      } catch (error) {
        console.error("Failed to fetch connected accounts:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to fetch connected accounts",
        });
        throw error;
      }
    },
    enabled: isSignedIn || !!currentAccountId,
    retry: 1,
    retryDelay: 1000,
    gcTime: 0,
  });
}

// Interface for the variables of useConnectAccount
interface ConnectAccountVariables {
  platform: Platform;
}

function openAuthPopupWindow() {
  if (typeof window === "undefined") {
    throw new Error("OAuth popup can only be opened in a browser.");
  }

  const width = 600;
  const height = 700;
  const left = Math.max(0, (window.innerWidth - width) / 2);
  const top = Math.max(0, (window.innerHeight - height) / 2);

  const popup = window.open(
    "about:blank",
    "authPopup",
    `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`,
  );

  if (!popup) {
    throw new Error("Popup blocked. Please allow popups for this site.");
  }

  return popup;
}

function waitForAuthPopupResult(popup: Window): Promise<void> {
  return new Promise((resolve, reject) => {
    let messageReceived = false;

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      clearInterval(checkClosedInterval);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== popup) return;

      const message = event.data as
        | {
            type?: string;
            data?: {
              success?: boolean;
              error?: string;
              userId?: string;
            };
          }
        | undefined;

      if (message?.type !== "AUTH_CALLBACK") return;

      messageReceived = true;
      cleanup();

      if (message.data?.success && message.data?.userId) {
        resolve();
        return;
      }

      reject(new Error(message.data?.error || "Authentication failed."));
    };

    window.addEventListener("message", handleMessage);

    const checkClosedInterval = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        if (!messageReceived) {
          reject(new Error("Authentication cancelled by user."));
        }
      }
    }, 500);
  });
}

function renderPopupError(popup: Window, message: string) {
  try {
    if (popup.closed) return;
    popup.document.open();
    popup.document.write(`
      <html>
        <head><title>Authentication Error</title></head>
        <body style="font-family: sans-serif; padding: 16px;">
          <h3>Authentication failed</h3>
          <p>${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
          <p>You can close this window and try again.</p>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
  } catch {
    // Ignore popup rendering errors (cross-origin / closed window)
  }
}

// Connect a platform account
export const useConnectAccount = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<void, Error, ConnectAccountVariables>({
    mutationKey: ["connectAccount"],
    mutationFn: async ({ platform }: ConnectAccountVariables): Promise<void> => {
      const popup = openAuthPopupWindow();
      try {
        const client = getClient();
        const authDetails = `loginToPlatform:${platform}`;
        const { data: activeSession } = await authClient.getSession();

        if (!activeSession?.user) {
          throw new Error("Please sign in first, then connect your wallet.");
        }

        let nearAccountId =
          (await resolveLinkedNearAccountId()) ?? getNearWalletDisplayFromSession(activeSession);
        if (!nearAccountId) {
          await linkNearWallet();
          const { data: linkedSession } = await authClient.getSession();
          nearAccountId =
            (await resolveLinkedNearAccountId()) ??
            getNearWalletDisplayFromSession(linkedSession ?? activeSession);
        }
        if (!nearAccountId) {
          throw new Error("Wallet account not available. Please connect your wallet first.");
        }

        toast({
          title: "Authenticating...",
          description: "Please sign the message in your wallet",
          variant: "default",
        });

        try {
          popup.blur();
        } catch {
          // ignore
        }
        window.focus();

        const message = `Authenticating request for NEAR account: ${nearAccountId}${authDetails ? ` (${authDetails})` : ""}`;
        const authToken = await signMessage(message, "crosspost.near");

        // Some SDK versions expect object auth payload while older ones accepted a JSON string.
        // Try object first, then fallback to string for compatibility.
        try {
          (
            client as unknown as { setAuthentication: (payload: Record<string, unknown>) => void }
          ).setAuthentication(authToken as unknown as Record<string, unknown>);
        } catch {
          (client as unknown as { setAuthentication: (payload: string) => void }).setAuthentication(
            JSON.stringify(authToken),
          );
        }

        // Ensure NEAR account is authorized before starting platform OAuth.
        // Some backends reject /auth/:platform/login until this succeeds.
        try {
          await client.auth.authorizeNearAccount();
        } catch (authorizeError) {
          console.warn("authorizeNearAccount failed before login:", authorizeError);
        }

        const response = (await client.auth.loginToPlatform(platform?.toLowerCase() as any, {
          redirect: true,
        })) as {
          success?: boolean;
          data?: { url?: string };
          errors?: { message?: string }[];
        };

        if (!response?.success) {
          const errorMessage = response?.errors?.[0]?.message || "Failed to start platform login.";
          throw new Error(errorMessage);
        }

        const authUrl = response?.data?.url;
        if (!authUrl) {
          throw new Error("Invalid authentication URL response.");
        }

        popup.location.href = authUrl;
        popup.focus();

        await waitForAuthPopupResult(popup);
        return;
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        renderPopupError(popup, errorMessage);
        console.error(`API Mutation Error [connectAccount/${platform}]:`, getErrorMessage(error));
        if (error instanceof Error) {
          throw error; // Re-throw original error if it's already an Error instance
        }
        throw new Error(getErrorMessage(error)); // Ensure an Error instance is thrown
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connectedAccounts"] });
    },
  });
};

// Disconnect a platform account
export const useDisconnectAccount = createAuthenticatedMutation<
  string,
  Error,
  { platform: Platform; userId: string }
>({
  mutationKey: ["disconnectAccount"],
  clientMethod: async (client, { platform, userId }) => {
    const response = await client.auth.revokeAuth(platform?.toLowerCase() as any, userId);
    if (response.success) {
      return response;
    } else {
      throw new Error(response.errors?.[0]?.message || "Failed to disconnect account");
    }
  },
  getAuthDetails: ({ platform, userId }) => `revokeAuth:${platform}:${userId}`,
  onSuccess: (userId, _, __, queryClient) => {
    // Invalidate the connected accounts query to trigger a refetch
    queryClient.invalidateQueries({ queryKey: ["connectedAccounts"] });

    // Also remove from selected accounts if it was selected
    const store = usePlatformAccountsStore.getState();
    if (typeof userId === "string" && store.selectedAccountIds.includes(userId)) {
      store.unselectAccount(userId);
    }
  },
});

// Refresh a platform account's token
export const useRefreshAccount = createAuthenticatedMutation<
  string,
  Error,
  { platform: Platform; userId: string }
>({
  mutationKey: ["refreshAccount"],
  clientMethod: async (client, { platform, userId }) => {
    const response = await client.auth.refreshProfile(platform?.toLowerCase() as any, userId);
    if (response.success) {
      return response;
    } else {
      throw new Error(response.errors?.[0]?.message || "Failed to refresh account");
    }
  },
  getAuthDetails: ({ platform, userId }) => `refreshProfile:${platform}:${userId}`,
  onSuccess: (_, __, ___, queryClient) => {
    // Invalidate the connected accounts query to trigger a refetch
    queryClient.invalidateQueries({ queryKey: ["connectedAccounts"] });
  },
});

// Check a platform account's status
export const useCheckAccountStatus = createAuthenticatedMutation<
  { userId: string; isConnected: boolean },
  Error,
  { platform: Platform; userId: string }
>({
  mutationKey: ["checkAccountStatus"],
  clientMethod: async (client, { platform, userId }) => {
    const response = await client.auth.getAuthStatus(platform?.toLowerCase() as any, userId);

    if (response.success) {
      const { authenticated, tokenStatus } = response.data;
      void (authenticated && tokenStatus.valid);
      return response;
    } else {
      throw new Error(response.errors?.[0]?.message || "Failed to check account status");
    }
  },
  getAuthDetails: ({ platform, userId }) => `getAuthStatus:${platform}:${userId}`,
  onSuccess: (data, _, __, queryClient) => {
    // Update the account in the cache
    queryClient.setQueryData(["connectedAccounts"], (oldData: ConnectedAccount[] | undefined) => {
      if (!oldData) return oldData;

      return oldData.map((account: ConnectedAccount) =>
        account.userId === data.userId
          ? {
              ...account,
              profile: account.profile ? { ...account.profile, lastUpdated: Date.now() } : null,
            }
          : account,
      );
    });
  },
});

export function useNearSocialAccount() {
  const { data: session } = authClient.useSession();
  const currentAccountId = session?.user?.id ?? null;
  const isSignedIn = !!session?.user;
  return useQuery({
    queryKey: ["profile", currentAccountId],
    queryFn: async () => {
      if (!isSignedIn) return null;
      try {
        const profile = await getProfile(currentAccountId!);

        // Get profile image URL or use a fallback
        const profileImageUrl = profile?.image ? getImageUrl(profile.image) : "";

        return {
          platform: "Near Social" as Platform,
          userId: currentAccountId!,
          connectedAt: "",
          profile: {
            userId: currentAccountId!,
            username: profile?.name || currentAccountId!,
            profileImageUrl,
            platform: "Near Social" as Platform,
            lastUpdated: Date.now(),
          },
        } as ConnectedAccount;
      } catch (error) {
        console.error("Error getting NEAR Social account profile:", getErrorMessage(error));
      }
    },
  });
}

// Hook to get all available accounts (API accounts + NEAR account)
export function useAllAccounts() {
  const { data: apiAccounts = [] } = useConnectedAccounts();
  const { data: profile } = useNearSocialAccount();

  // Filter out any malformed accounts that might be missing required properties
  return [...apiAccounts, ...(profile ? [profile] : [])];
}

// Hook to get selected accounts
export function useSelectedAccounts() {
  const allAccounts = useAllAccounts();
  const selectedAccountIds = usePlatformAccountsStore((state) => state.selectedAccountIds);

  // Filter accounts to only include selected ones
  return allAccounts.filter((account: ConnectedAccount) =>
    selectedAccountIds.includes(account.userId),
  );
}
