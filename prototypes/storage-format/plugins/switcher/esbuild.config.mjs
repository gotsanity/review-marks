// PROTOTYPE build: bundles src/main.ts and copies manifest + styles into the test vault.
import esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "..", "vault", ".obsidian", "plugins", "proto-format-switcher");
mkdirSync(out, { recursive: true });

await esbuild.build({
  entryPoints: [join(here, "src", "main.ts")],
  bundle: true,
  format: "cjs",
  target: "es2020",
  platform: "browser",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  outfile: join(out, "main.js"),
  logLevel: "info",
});

copyFileSync(join(here, "manifest.json"), join(out, "manifest.json"));
copyFileSync(join(here, "styles.css"), join(out, "styles.css"));
