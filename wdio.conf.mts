import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { env, platform } from 'process';
import { parseObsidianVersions } from 'wdio-obsidian-service';
import { DEFAULT_VAULT } from './test/e2e/fixtures.ts';

// Downloaded Obsidian builds are cached here (git-ignored, cached in CI).
const cacheDir = path.resolve('.obsidian-cache');

// Space-separated "appVersion/installerVersion" pairs. "earliest" is the
// manifest's minAppVersion (the 1.7.4 floor). Override with OBSIDIAN_VERSIONS
// to run a single version, e.g. OBSIDIAN_VERSIONS="latest/latest".
const versions = await parseObsidianVersions(
	env.OBSIDIAN_VERSIONS ?? 'earliest/earliest latest/latest',
	{ cacheDir },
);

if (env.CI) {
	// CI greps this line to key the .obsidian-cache cache (see ci.yml).
	console.log('obsidian-cache-key:', JSON.stringify(versions));
}

// On Windows, every Obsidian launch re-points the obsidian:// link handler at
// the downloaded test build. Back it up before the run and put it back after,
// so a local run leaves the developer's own Obsidian install as it was.
//
// Several runs can overlap on one machine (parallel worktrees), each with its
// own .obsidian-cache. So the backup is shared, and it only ever holds a
// handler that isn't a test build: a run that starts while another run's
// build is registered keeps the existing backup. A run restores only if the
// handler still points at its own build; if another run has re-pointed it,
// that run restores when it finishes.
const LINK_HANDLER_KEY = 'HKCU\\Software\\Classes\\obsidian';
const LINK_HANDLER_COMMAND = `${LINK_HANDLER_KEY}\\shell\\open\\command`;
const linkHandlerBackup = path.join(os.tmpdir(), 'review-marks-obsidian-handler.reg');

/** The handler's command line, or null if none is registered. */
function linkHandlerCommand(): string | null {
	try {
		const out = execFileSync('reg', ['query', LINK_HANDLER_COMMAND, '/ve'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
		return /REG_(?:EXPAND_)?SZ\s+(.*)$/m.exec(out)?.[1]?.trim() ?? null;
	} catch {
		return null;
	}
}

const normalize = (p: string) => p.replace(/\//g, '\\').toLowerCase();

/** Whether `command` launches an Obsidian build from any run's .obsidian-cache. */
const isTestBuild = (command: string) => normalize(command).includes('\\.obsidian-cache\\');

/** Whether `command` launches an Obsidian build from this run's cache. */
const isOwnTestBuild = (command: string) => normalize(command).includes(normalize(cacheDir) + '\\');

function backUpLinkHandler(): void {
	if (platform !== 'win32') return;
	const command = linkHandlerCommand();
	// None registered, or a test build: there's no original to save.
	if (command === null || isTestBuild(command)) return;
	execFileSync('reg', ['export', LINK_HANDLER_KEY, linkHandlerBackup, '/y'], { stdio: 'ignore' });
}

function restoreLinkHandler(): void {
	if (platform !== 'win32') return;
	const command = linkHandlerCommand();
	if (command === null || !isOwnTestBuild(command) || !fs.existsSync(linkHandlerBackup)) return;
	execFileSync('reg', ['import', linkHandlerBackup], { stdio: 'ignore' });
}

export const config: WebdriverIO.Config = {
	onPrepare: backUpLinkHandler,
	onComplete: restoreLinkHandler,

	runner: 'local',
	framework: 'mocha',
	specs: ['./test/e2e/specs/**/*.e2e.ts'],
	maxInstances: Number(env.WDIO_MAX_INSTANCES || 2),

	capabilities: versions.map<WebdriverIO.Capabilities>(
		([appVersion, installerVersion]) => ({
			browserName: 'obsidian',
			'wdio:obsidianOptions': {
				appVersion,
				installerVersion,
				// Installs the built plugin (manifest.json, main.js, styles.css)
				// from the repo root, so run `npm run build` first.
				plugins: ['.'],
				// Each session starts in a fresh temp copy of this vault.
				vault: DEFAULT_VAULT,
			},
		}),
	),

	services: ['obsidian'],
	reporters: ['obsidian'],
	cacheDir,

	mochaOpts: {
		ui: 'bdd',
		timeout: 60 * 1000,
		// Every test starts from the fixture vault with no notes open, the plugin settings as
		// loaded and the window layout settled (see test/e2e/harness.ts). A root hook, so it runs
		// before each spec's own beforeEach (wdio's beforeTest runs after it). Imported lazily, so
		// CI can load this file to read the cache key without a browser.
		rootHooks: {
			beforeEach: async () => (await import('./test/e2e/harness.ts')).freshState(),
		},
	},
	waitforInterval: 250,
	waitforTimeout: 5 * 1000,
	logLevel: 'warn',

	// Specs import describe/it/expect explicitly.
	injectGlobals: false,
};
