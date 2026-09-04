import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Separate from vite.config.ts on purpose: that config runs `crx({ manifest })`, which
 * builds a whole extension and is not something the test runner should be doing.
 *
 * The default environment stays `node` — the origin model is pure and must keep
 * running without a DOM. UI tests opt in with a `@vitest-environment jsdom` docblock.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
  },
})
