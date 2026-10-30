// PROTOTYPE: install and build the B+ plugin (plugins/review-marks) into vault/.obsidian/plugins/proto-review-marks/.
// The older variant plugins (format-a to -d, switcher) stay in plugins/ for history but are no longer built,
// so their output doesn't come back into the test vault.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "plugins", "review-marks");
const run = (args) => {
  const cmd = `npm ${args.join(" ")}`;
  console.log(`\n> ${cmd}  (${dir})`);
  // Run through the shell so npm.cmd resolves on Windows. One string, no args array (avoids DEP0190).
  const r = spawnSync(cmd, { cwd: dir, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`FAILED in ${dir}`);
    process.exit(r.status ?? 1);
  }
};

run(["install", "--no-audit", "--no-fund"]);
run(["run", "build"]);

console.log("\nDone. Open prototypes/storage-format/vault as a vault in Obsidian.");
