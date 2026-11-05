import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		// The `obsidian` package has typings only; tests get a small stand-in.
		alias: { obsidian: fileURLToPath(new URL('./src/test-support/obsidian.ts', import.meta.url)) },
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
	},
});
