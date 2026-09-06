import { useEffect, useState } from 'react'
import { Attribution } from '../shared/Attribution'
import { OriginCache } from '../shared/cache'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../shared/settings'
import type { CacheStats } from '../shared/cache'
import type { Settings } from '../shared/settings'

export function App() {
  const { name, version } = chrome.runtime.getManifest()
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [stats, setStats] = useState<CacheStats | null>(null)

  const refresh = () => {
    void loadSettings().then(setSettings)
    void new OriginCache().stats().then(setStats)
  }

  useEffect(refresh, [])

  const toggle = async () => {
    setSettings(await saveSettings({ enabled: !settings.enabled }))
  }

  const clearCache = async () => {
    await new OriginCache().clear()
    refresh()
  }

  return (
    <main className="w-72 space-y-3 p-4 font-sans text-sm text-slate-800">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-base font-semibold">{name}</h1>
        <button
          type="button"
          onClick={() => void toggle()}
          aria-pressed={settings.enabled}
          className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            settings.enabled
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-slate-300 bg-slate-100 text-slate-600'
          }`}
        >
          {settings.enabled ? 'On' : 'Off'}
        </button>
      </div>

      {!settings.enabled && (
        <p className="text-xs text-slate-500">
          No page will be read from the next load onwards. Amazon tabs already open keep their badge
          until you reload them.
        </p>
      )}

      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase">Cached</h2>
        {stats ? (
          <dl className="mt-1 space-y-0.5 text-xs">
            <div className="flex justify-between">
              <dt className="text-slate-600">Products remembered</dt>
              <dd>
                {stats.fresh} / {stats.capacity}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">With an origin found</dt>
              <dd>{stats.answered}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Barcodes indexed</dt>
              <dd>{stats.gtinsIndexed}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Reading…</p>
        )}
        <button
          type="button"
          onClick={() => void clearCache()}
          className="mt-2 w-full cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs"
        >
          Clear cache
        </button>
        <p className="mt-1 text-xs text-slate-500">
          Everything is stored in this browser. Nothing is sent anywhere.
        </p>
      </section>

      <button
        type="button"
        onClick={() => chrome.runtime.openOptionsPage()}
        className="w-full cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs"
      >
        Settings
      </button>

      <Attribution version={version} />
    </main>
  )
}
