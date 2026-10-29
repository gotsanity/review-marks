// PROTOTYPE build: bundles src/main.ts and copies manifest + styles into the test vault.
import esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "fs";

const out = "../../vault/.obsidian/plugins/proto-format-d";
mkdirSync(out, { recursive: true });

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2018",
  platform: "browser",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  outfile: `${out}/main.js`,
  logLevel: "info",
});

copyFileSync("manifest.json", `${out}/manifest.json`);
copyFileSync("styles.css", `${out}/styles.css`);
