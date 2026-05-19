import { createPluginRuntime } from "every-plugin";
import { Context, Effect, Layer } from "effect";
import type { RuntimeConfig } from "everything-dev/types";
import { ConfigService } from "./config";
import { PluginError } from "./errors";

export interface LoadedPlugin {
  key: string;
  name: string;
  createClient: (ctx?: unknown) => unknown;
  api: unknown;
  router: unknown;
  metadata: {
    remoteUrl: string;
    version?: string;
  };
}

export interface PluginStatus {
  available: boolean;
  pluginName: string | null;
  error: string | null;
  errorDetails: string | null;
  loadedPlugins: string[];
}

export interface PluginResult {
  runtime: ReturnType<typeof createPluginRuntime> | null;
  api: LoadedPlugin | null;
  plugins: Record<string, LoadedPlugin>;
  status: PluginStatus;
}

function secretsFromEnv(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

type PluginInitConfig = RuntimeConfig["api"] | RuntimePluginInput;

const PLUGIN_URL_PREFIX = /^(https?:\/\/|local:)/i;

function validatePluginConfig(key: string, config: PluginInitConfig): void {
  const name = typeof config.name === "string" ? config.name.trim() : "";
  const url = typeof config.url === "string" ? config.url.trim() : "";
  const entry = typeof config.entry === "string" ? config.entry.trim() : "";
  const source = config.source;

  if (!name) {
    console.warn(`[Plugins] ⚠️  ${key}: invalid plugin config — "name" is missing or empty`);
  }
  if (!entry) {
    console.warn(`[Plugins] ⚠️  ${key}: invalid plugin config — "entry" (remote entry path) is missing or empty`);
  }
  if (!source) {
    console.warn(`[Plugins] ⚠️  ${key}: invalid plugin config — "source" must be "local" or "remote"`);
  }

  if (!url) {
    console.warn(`[Plugins] ⚠️  ${key}: no "url" set — plugin will not be registered`);
    return;
  }

  if (!PLUGIN_URL_PREFIX.test(url)) {
    console.warn(
      `[Plugins] ⚠️  ${key}: url should start with http://, https://, or local: — received: ${url.slice(0, 80)}${url.length > 80 ? "…" : ""}`,
    );
  } else if (url.startsWith("http")) {
    try {
      new URL(url);
    } catch {
      console.warn(`[Plugins] ⚠️  ${key}: url is not a valid absolute URL: ${url}`);
    }
  }

  if (config.secrets && config.secrets.length > 0) {
    for (const secret of config.secrets) {
      if (!process.env[secret] || process.env[secret] === "") {
        console.warn(`[Plugins] ⚠️  ${key}: Missing secret '${secret}'`);
        console.warn(`[Plugins]    Plugin may fail to initialize`);
      }
    }
  }
}

const unavailableResult = (
  pluginName: string | null,
  error: string | null,
  errorDetails: string | null,
  loadedPlugins: string[] = [],
): PluginResult => ({
  runtime: null,
  api: null,
  plugins: {},
  status: { available: false, pluginName, error, errorDetails, loadedPlugins },
});

type RuntimePluginInput = NonNullable<RuntimeConfig["plugins"]>[string];

interface RuntimePluginEntry {
  key: string;
  runtimeId: string;
  config: RuntimeConfig["api"] | RuntimePluginInput;
}

function buildRegistryEntries(config: RuntimeConfig): RuntimePluginEntry[] {
  const entries: RuntimePluginEntry[] = [];
  if (config.api?.url) {
    entries.push({ key: "api", runtimeId: config.api.name, config: config.api });
  }
  for (const [key, plugin] of Object.entries(config.plugins ?? {})) {
    if (plugin.url) {
      entries.push({ key, runtimeId: plugin.name, config: plugin });
    }
  }
  return entries;
}

function collectSecrets(config: RuntimePluginInput): Record<string, string> {
  return secretsFromEnv(config.secrets ?? []);
}

export const initializePlugins = Effect.gen(function* () {
  const config: RuntimeConfig = yield* ConfigService;

  if (config.api.proxy) {
    console.log(`[Plugins] Proxy mode enabled, skipping plugin initialization`);
    console.log(`[Plugins] API requests will be proxied to: ${config.api.proxy}`);
    return {
      runtime: null,
      api: null,
      plugins: {},
      status: {
        available: false,
        pluginName: config.api.name,
        error: null,
        errorDetails: null,
        loadedPlugins: [],
      },
    } satisfies PluginResult;
  }

  const registryEntries = buildRegistryEntries(config);
  if (registryEntries.length === 0) {
    console.log("[Plugins] No remote plugins configured, using host API only");
    return unavailableResult(config.api.name, null, null);
  }

  console.log(`[Plugins] Registering ${registryEntries.length} plugin(s)`);

  const result = yield* Effect.tryPromise({
    try: async () => {
      const runtime = createPluginRuntime({
        registry: Object.fromEntries(
          registryEntries.map((entry) => [entry.runtimeId, { remote: entry.config.url }]),
        ),
        secrets: {},
      });

      const loaded = await Promise.allSettled(
        registryEntries.map(async (entry) => {
          validatePluginConfig(entry.key, entry.config);

          const variables: Record<string, unknown> = {
            ...entry.config.variables,
          };

          if (entry.key === "api") {
            variables.registryNamespace = config.account;
          }

          const plugin = await runtime.usePlugin(entry.runtimeId as never, {
            // @ts-expect-error dynamic runtime config
            variables,
            // @ts-expect-error dynamic runtime config
            secrets: collectSecrets(entry.config),
          });

          return {
            key: entry.key,
            name: entry.config.name,
            createClient: plugin.createClient as unknown as (ctx?: unknown) => unknown,
            api: plugin.createClient(),
            router: plugin.router,
            metadata: {
              remoteUrl: entry.config.url,
              version: plugin.metadata.version,
            },
          } satisfies LoadedPlugin;
        }),
      );

      const plugins: Record<string, LoadedPlugin> = {};
      const loadedPlugins: string[] = [];
      let baseApi: LoadedPlugin | null = null;
      const errors: string[] = [];

      loaded.forEach((result, index) => {
        const entry = registryEntries[index];
        const key = entry?.key ?? "unknown";
        if (result.status === "fulfilled") {
          plugins[key] = result.value;
          loadedPlugins.push(key);
          if (key === "api") {
            baseApi = result.value;
          }
        } else {
          const error = result.reason;
          const errorMessage = error instanceof Error ? error.message : String(error);

          if (errorMessage.includes("fetch failed") || errorMessage.includes("ENOTFOUND")) {
            console.error(`[Plugins] ❌ ${key}: Cannot reach plugin server`);
            console.error(`[Plugins]    URL: ${entry?.config?.url}`);
            console.error(`[Plugins]    Ensure plugin dev server is running`);
          } else if (errorMessage.includes("is required")) {
            console.error(`[Plugins] ❌ ${key}: Missing required configuration`);
            console.error(`[Plugins]    ${errorMessage}`);
            console.error(`[Plugins]    Check plugin.dev.ts for required secrets`);
          } else if (errorMessage.includes("timeout")) {
            console.error(`[Plugins] ❌ ${key}: Plugin initialization timed out`);
            console.error(`[Plugins]    This might indicate a slow external API`);
          } else {
            console.error(`[Plugins] ❌ ${key}: ${errorMessage}`);
            if (error instanceof Error && error.stack) {
              const stackLines = error.stack.split("\n").slice(0, 3);
              console.error(`[Plugins]    ${stackLines.join("\n    ")}`);
            }
          }

          errors.push(errorMessage);
        }
      });

      return {
        runtime,
        api: baseApi,
        plugins,
        status: {
          available: Boolean(baseApi),
          pluginName: config.api.name,
          error: errors.length > 0 ? errors.join("; ") : null,
          errorDetails: errors.length > 0 ? errors.join("\n") : null,
          loadedPlugins,
        },
      } satisfies PluginResult;
    },
    catch: (error) =>
      new PluginError({
        pluginName: config.api.name,
        pluginUrl: config.api.url,
        cause: error,
      }),
  });

  return result;
}).pipe(
  Effect.catchAll((error) => {
    const pluginName = error instanceof PluginError ? error.pluginName : null;
    const pluginUrl = error instanceof PluginError ? error.pluginUrl : null;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error("[Plugins] ❌ Failed to initialize plugin");
    console.error(`[Plugins] Plugin: ${pluginName}`);
    console.error(`[Plugins] URL: ${pluginUrl}`);
    console.error(`[Plugins] Error: ${errorMessage}`);
    console.warn("[Plugins] Server will continue without plugin functionality");

    return Effect.succeed(unavailableResult(pluginName ?? null, errorMessage, errorStack ?? null));
  }),
);

export class PluginsService extends Context.Tag("host/PluginsService")<
  PluginsService,
  PluginResult
>() {
  static Live = Layer.scoped(
    PluginsService,
    Effect.gen(function* () {
      const plugins = yield* initializePlugins;

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          if (plugins.runtime) {
            console.log("[Plugins] Shutting down plugin runtime...");
            plugins.runtime.shutdown();
          }
        }),
      );

      return plugins;
    }),
  );
}

export function createAggregateApiClient(result: PluginResult, context?: unknown): unknown {
  const baseClient = (result.api?.createClient ? result.api.createClient(context) : {}) as Record<
    string,
    unknown
  >;
  const pluginClients: Record<string, unknown> = {};

  for (const [key, plugin] of Object.entries(result.plugins)) {
    if (key === "api") continue;
    pluginClients[key] = plugin.createClient(context);
  }

  return { ...baseClient, ...pluginClients };
}
