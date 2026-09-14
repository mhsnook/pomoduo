import { defineConfig } from 'vitest/config'

// Unit tests cover the pure modules only, so they run in plain Node.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
	},
})
