interface EVMChain {
  chainId: number;
  name: string;
  explorer: string;
  rpc: string;
}

interface EVMWalletChains {
  [key: string]: EVMChain;
}

const evmWalletChains: EVMWalletChains = {
  mainnet: {
    chainId: 397,
    name: "Near Mainnet",
    explorer: "https://eth-explorer.near.org",
    rpc: "https://eth-rpc.mainnet.near.org",
  },
  testnet: {
    chainId: 398,
    name: "Near Testnet",
    explorer: "https://eth-explorer-testnet.near.org",
    rpc: "https://eth-rpc.testnet.near.org",
  },
};

export const NETWORK_ID = "mainnet";
export const EVMWalletChain = evmWalletChains[NETWORK_ID];

const PUBLIC_OPEN_CROSSPOST_API = (
  import.meta.env as { PUBLIC_OPEN_CROSSPOST_API?: string }
).PUBLIC_OPEN_CROSSPOST_API?.trim();

const RAW_OPEN_CROSSPOST_PROXY_API =
  PUBLIC_OPEN_CROSSPOST_API || process.env.OPEN_CROSSPOST_PROXY_API || "";

export const OPEN_CROSSPOST_PROXY_API = RAW_OPEN_CROSSPOST_PROXY_API;

function resolveCrosspostDefaultOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  const fromEnv = hostOriginFromPublicEnv();
  if (fromEnv) return fromEnv;
  const fromRuntime = hostOriginFromRuntime();
  if (fromRuntime) return fromRuntime;
  return "http://127.0.0.1:3000";
}

function hostOriginFromRuntime(): string | null {
  if (typeof window === "undefined") return null;
  const hostUrl = (window as unknown as { __RUNTIME_CONFIG__?: { hostUrl?: string } })
    .__RUNTIME_CONFIG__?.hostUrl;
  if (!hostUrl) return null;
  try {
    return new URL(hostUrl).origin;
  } catch {
    return null;
  }
}

function hostOriginFromPublicEnv(): string | null {
  const raw = (import.meta.env as { PUBLIC_DEV_HOST_URL?: string }).PUBLIC_DEV_HOST_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function getCrosspostApiBaseUrl(): string {
  const raw = String(RAW_OPEN_CROSSPOST_PROXY_API ?? "").trim();

  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, "");
  }

  if (raw.startsWith("/")) {
    const origin = resolveCrosspostDefaultOrigin();
    return `${origin}${raw}`.replace(/\/+$/, "");
  }

  return resolveCrosspostDefaultOrigin();
}

// Authentication configuration
export const AUTH_STORAGE_PREFIX = "crosspost_auth_";
export { APP_NAME } from "@/lib/branding";
