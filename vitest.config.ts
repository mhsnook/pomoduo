import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { configDefaults, defineConfig } from 'vitest/config'

// Unit tests cover the pure modules and run in plain Node. The session room's
// tests run in workerd, against a real Durable Object with its storage and alarm.
export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'node',
					include: ['src/**/*.test.ts', '.github/ci/*.test.ts'],
					exclude: [...configDefaults.exclude, 'src/server/**'],
					environment: 'node',
				},
			},
			{
				plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
				test: {
					name: 'workerd',
					include: ['src/server/**/*.test.ts'],
				},
			},
		],
	},
})
