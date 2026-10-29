// PROTOTYPE build: bundles src/main.ts and copies manifest + styles into the test vault.
import esbuild from "esbuild";
import fs from "fs";

const out = "../../vault/.obsidian/plugins/proto-format-c";
fs.mkdirSync(out, { recursive: true });

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2018",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  outfile: `${out}/main.js`,
  logLevel: "info",
});

fs.copyFileSync("manifest.json", `${out}/manifest.json`);
fs.copyFileSync("styles.css", `${out}/styles.css`);
