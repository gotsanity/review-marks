// PROTOTYPE build: bundles src/main.ts and copies manifest + styles into the test vault.
import esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "fs";

const out = "../../vault/.obsidian/plugins/proto-format-a";
mkdirSync(out, { recursive: true });

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2018",
  outfile: `${out}/main.js`,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  logLevel: "info",
});
copyFileSync("manifest.json", `${out}/manifest.json`);
copyFileSync("styles.css", `${out}/styles.css`);
