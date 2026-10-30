import { readFileSync, writeFileSync } from 'node:fs';

// Two callers: `npm version` (sets npm_package_version) and the release-please
// workflow (reads the version release-please already wrote to manifest.json).
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const targetVersion = process.env.npm_package_version ?? manifest.version;
const { minAppVersion } = manifest;

// Under `npm version`, also write the new version into manifest.json.
if (process.env.npm_package_version) {
	manifest.version = targetVersion;
	writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t') + '\n');
}

const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
if (versions[targetVersion] !== minAppVersion) {
	versions[targetVersion] = minAppVersion;
	writeFileSync('versions.json', JSON.stringify(versions, null, '\t') + '\n');
}
