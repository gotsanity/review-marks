import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'commitlint.config.mjs',
		'vitest.config.ts',
		'wdio.conf.mts',
		'.obsidian-cache',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
		'release-please-config.json',
		'.release-please-manifest.json',
		'CHANGELOG.md',
		'prototypes',
		'docs',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ['test/e2e/**/*.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: "CallExpression[callee.object.name='obsidianPage'][callee.property.name='resetVault'] > ObjectExpression",
					message: 'Use resetVaultTo from test/e2e/harness.ts: resetVault with only an object deletes the vault config dir.',
				},
			],
		},
	},
);
