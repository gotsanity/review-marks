// PROTOTYPE: install and build every plugin under prototypes/storage-format/plugins/*.
// Each build writes its output into vault/.obsidian/plugins/<plugin-id>/.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginsDir = join(dirname(fileURLToPath(import.meta.url)), "plugins");
const run = (args, cwd) => {
  const cmd = `npm ${args.join(" ")}`;
  console.log(`\n> ${cmd}  (${cwd})`);
  // Run through the shell so npm.cmd resolves on Windows. One string, no args array (avoids DEP0190).
  const r = spawnSync(cmd, { cwd, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`FAILED in ${cwd}`);
    process.exit(r.status ?? 1);
  }
};

for (const name of readdirSync(pluginsDir).sort()) {
  const dir = join(pluginsDir, name);
  if (!existsSync(join(dir, "package.json"))) continue;
  run(["install", "--no-audit", "--no-fund"], dir);
  run(["run", "build"], dir);
}

console.log("\nDone. Open prototypes/storage-format/vault as a vault in Obsidian.");
