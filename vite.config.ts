import { existsSync, readdirSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest.json'

const projectRoot = resolve(import.meta.dirname)

/**
 * Where the unpacked extension is written. Defaults to `dist/` in the repo.
 *
 * Set `COUNTRY_MADE_IN_DIST` to build straight onto the Windows filesystem
 * instead, e.g. `COUNTRY_MADE_IN_DIST=/mnt/c/Users/mike/country-made-in`. Chrome
 * unloads an unpacked extension whenever its folder becomes unreadable, and a
 * `\\wsl.localhost\…` path disappears the moment WSL stops — so a native path
 * survives a reboot. Unset, CI and a fresh clone still build to `dist/`.
 *
 * The value is validated rather than trusted, because the build **empties this
 * directory**. `emptyOutDir: true` is what lets Vite clear a directory outside
 * the project root — which also switches off the guard that would otherwise stop
 * it, for every value and not just the intended one. An empty string resolves to
 * the project root, and a path one segment short of the target (say
 * `/mnt/c/Users/mike`) is an ordinary home directory. Either would be deleted
 * without a usable warning, taking untracked files such as `key.pem` — which
 * pins the extension ID — with them.
 */
function resolveOutDir(): string {
  const raw = process.env.COUNTRY_MADE_IN_DIST
  if (raw === undefined) return 'dist'

  const value = raw.trim()
  const fail = (why: string): never => {
    throw new Error(`COUNTRY_MADE_IN_DIST ${why}. Got: ${JSON.stringify(raw)}`)
  }

  if (value === '') fail('is set but empty, which would target the project root')
  if (!isAbsolute(value)) fail('must be an absolute path')

  const target = resolve(value)
  if (target === projectRoot || projectRoot.startsWith(target + sep)) {
    fail('must not be the project root or a directory containing it')
  }

  // Only ever empty somewhere that already looks like our own build output.
  // A previous build leaves a manifest.json behind; anything else populated is
  // far more likely to be a mistyped path than a directory meant to be wiped.
  if (
    existsSync(target) &&
    readdirSync(target).length > 0 &&
    !existsSync(resolve(target, 'manifest.json'))
  ) {
    fail('points at a non-empty directory that is not a previous build (no manifest.json)')
  }

  return target
}

const outDir = resolveOutDir()

export default defineConfig({
  plugins: [tailwindcss(), react(), crx({ manifest })],
  build: {
    outDir,
    // Clears stale chunks between builds. Safe only because resolveOutDir has
    // already rejected anything that isn't an existing build output.
    emptyOutDir: true,
  },
})
