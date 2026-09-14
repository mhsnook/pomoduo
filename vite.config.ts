import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	// The Cloudflare plugin runs the Worker in workerd beside the client, so
	// `pnpm dev` serves the app and the session rooms from one origin.
	plugins: [react(), tailwindcss(), cloudflare()],
})
