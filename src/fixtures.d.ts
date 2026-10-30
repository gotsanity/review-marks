// Vitest (Vite) imports a file's text with the `?raw` suffix. Used by unit tests for fixture notes.
declare module '*.md?raw' {
	const text: string;
	export default text;
}
