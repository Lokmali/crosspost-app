import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ModuleFederationPlugin } from "@module-federation/enhanced/rspack";
import { pluginModuleFederation } from "@module-federation/rsbuild-plugin";
import { defineConfig } from "@rsbuild/core";
import { pluginNodePolyfill } from "@rsbuild/plugin-node-polyfill";
import { pluginReact } from "@rsbuild/plugin-react";
import { TanStackRouterRspack } from "@tanstack/router-plugin/rspack";
import { withZephyr } from "zephyr-rsbuild-plugin";
import pkg from "./package.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const normalizedName = pkg.name;
const shouldDeploy = process.env.DEPLOY === "true";
const buildTarget = process.env.BUILD_TARGET as "client" | "server" | undefined;
const isServerBuild = buildTarget === "server";

function resolveDevServerPort(fallback: number): number {
  const n = Number(process.env.PORT);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const bosConfigPath = path.resolve(__dirname, "../bos.config.json");
const bosConfig = JSON.parse(fs.readFileSync(bosConfigPath, "utf8"));
const uiSharedDeps = bosConfig.shared?.ui ?? {};

function updateBosConfig(field: "production" | "ssr", url: string) {
  try {
    const configPath = path.resolve(__dirname, "../bos.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

    if (!config.app.ui) {
      console.error("   ❌ app.ui not found in bos.config.json");
      return;
    }

    config.app.ui[field] = url;
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`   ✅ Updated bos.config.json: app.ui.${field}`);
  } catch (err) {
    console.error("   ❌ Failed to update bos.config.json:", (err as Error).message);
  }
}

const isDevClient = process.env.NODE_ENV !== "production";

const openCrosspostUpstream =
  process.env.OPEN_CROSSPOST_UPSTREAM_URL?.trim().replace(/\/$/, "") ||
  "https://api.opencrosspost.com";

function createClientConfig() {
  const plugins = [
    pluginReact(),
    pluginNodePolyfill(),
    pluginModuleFederation({
      name: normalizedName,
      filename: "remoteEntry.js",
      dts: false,
      exposes: {
        "./Router": "./src/router.tsx",
        "./Hydrate": "./src/hydrate.tsx",
      },
      shared: uiSharedDeps,
    }),
  ];

  if (shouldDeploy) {
    plugins.push(
      withZephyr({
        hooks: {
          onDeployComplete: (info) => {
            console.log("🚀 UI Client Deployed:", info.url);
            updateBosConfig("production", info.url);
          },
        },
      }),
    );
  }

  return defineConfig({
    plugins,
    source: {
      entry: {
        index: "./src/dev-entry.tsx",
      },
      define: {
        "import.meta.env.PUBLIC_DEV_HOST_URL": JSON.stringify(process.env.PUBLIC_DEV_HOST_URL ?? ""),
        "import.meta.env.PUBLIC_OPEN_CROSSPOST_API": JSON.stringify(
          process.env.PUBLIC_OPEN_CROSSPOST_API ?? "",
        ),
      },
    },
    resolve: {
      alias: {
        "@": "./src",
      },
    },
    dev: {
      lazyCompilation: false,
      progressBar: false,
      client: {
        overlay: false,
      },
    },
    server: {
      port: resolveDevServerPort(3002),
      strictPort: true,
      host: "0.0.0.0",
      printUrls: ({ urls }) => urls.filter((url) => url.includes("localhost")),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers":
          "X-Requested-With, Content-Type, Accept, Authorization, X-Near-Account",
      },
      proxy: {
        "/health": { target: openCrosspostUpstream, changeOrigin: true },
        "/auth": { target: openCrosspostUpstream, changeOrigin: true },
        "/api/post": { target: openCrosspostUpstream, changeOrigin: true },
        "/api/activity": { target: openCrosspostUpstream, changeOrigin: true },
        "/api/rate-limit": { target: openCrosspostUpstream, changeOrigin: true },
      },
    },
    tools: {
      rspack: {
        target: "web",
        output: {
          uniqueName: normalizedName,
        },
        infrastructureLogging: { level: "error" },
        stats: "errors-warnings",
        ...(isDevClient
          ? {
              optimization: {
                splitChunks: false,
              },
            }
          : {}),
        plugins: [
          TanStackRouterRspack({
            target: "react",
            autoCodeSplitting: false,
          }),
        ],
      },
    },
    output: {
      distPath: { root: "dist", css: "static/css", js: "static/js" },
      assetPrefix: "auto",
      filename: { js: "[name].js", css: "style.css" },
      copy: [{ from: path.resolve(__dirname, "public"), to: "./" }],
    },
  });
}

function createServerConfig() {
  const plugins = [pluginReact()];

  if (shouldDeploy) {
    plugins.push(
      withZephyr({
        hooks: {
          onDeployComplete: (info) => {
            console.log("🚀 UI SSR Deployed:", info.url);
            updateBosConfig("ssr", info.url);
          },
        },
      }),
    );
  }

  return defineConfig({
    plugins,
    source: {
      entry: {
        index: "./src/router.server.tsx",
      },
      define: {
        "import.meta.env.PUBLIC_DEV_HOST_URL": JSON.stringify(process.env.PUBLIC_DEV_HOST_URL ?? ""),
        "import.meta.env.PUBLIC_OPEN_CROSSPOST_API": JSON.stringify(
          process.env.PUBLIC_OPEN_CROSSPOST_API ?? "",
        ),
      },
    },
    resolve: {
      alias: {
        "@": "./src",
        "@tanstack/react-devtools": false,
        "@tanstack/react-router-devtools": false,
      },
    },
    server: {
      port: resolveDevServerPort(3003),
      printUrls: ({ urls }) => urls.filter((url) => url.includes("localhost")),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers":
          "X-Requested-With, Content-Type, Accept, Authorization, X-Near-Account",
      },
    },
    tools: {
      rspack: {
        target: "async-node",
        output: {
          uniqueName: `${normalizedName}_server`,
          publicPath: "/",
          library: { type: "commonjs-module" },
        },
        externals: [/^node:/],
        infrastructureLogging: { level: "error" },
        stats: "errors-warnings",
        plugins: [
          TanStackRouterRspack({ target: "react", autoCodeSplitting: false }),
          new ModuleFederationPlugin({
            name: normalizedName,
            filename: "remoteEntry.server.js",
            dts: false,
            runtimePlugins: [require.resolve("@module-federation/node/runtimePlugin")],
            library: { type: "commonjs-module" },
            exposes: { "./Router": "./src/router.server.tsx" },
            shared: uiSharedDeps,
          }),
        ],
      },
    },
    output: {
      distPath: { root: "dist" },
      assetPrefix: "auto",
      cleanDistPath: false,
    },
  });
}

export default isServerBuild ? createServerConfig() : createClientConfig();
