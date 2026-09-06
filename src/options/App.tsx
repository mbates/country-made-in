import { useEffect, useState } from 'react'
import { Attribution } from '../shared/Attribution'
import { ALL_MARKETPLACES, DEFAULT_SETTINGS, loadSettings, saveSettings } from '../shared/settings'
import type { OriginSourceId } from '../shared/sources'
import type { BadgeDensity, Settings } from '../shared/settings'
import type { Marketplace } from '../shared/marketplaces'

/**
 * Sources the extension can read, keyed by `Evidence.sourceId`.
 *
 * Only the on-page sources exist today; the wider-search sources arrive with plan 05 and
 * are listed here as they land. A toggle for something that cannot run yet would be a
 * lie, so the list is what actually exists.
 */
export const SOURCES: { id: OriginSourceId; label: string; detail: string }[] = [
  {
    id: 'amazon-detail-table',
    label: 'Product details table',
    detail: 'The details and specification tables on the product page.',
  },
  {
    id: 'amazon-detail-bullets',
    label: 'Detail bullets',
    detail: 'The bulleted product information list.',
  },
  {
    id: 'amazon-definition-list',
    label: 'Definition lists',
    detail: 'Term-and-value pairs some layouts use instead of a table.',
  },
]

const DENSITY: { value: BadgeDensity; label: string; detail: string }[] = [
  { value: 'off', label: 'None', detail: 'Badges only on product pages.' },
  {
    value: 'unknown-only',
    label: 'Only where unknown',
    detail: 'Mark tiles whose origin needs a wider search.',
  },
  { value: 'all', label: 'All tiles', detail: 'A badge on every result.' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

function Check({
  checked,
  onChange,
  label,
  detail,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  detail?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        <span className="text-slate-800">{label}</span>
        {detail && <span className="block text-xs text-slate-500">{detail}</span>}
      </span>
    </label>
  )
}

export function App() {
  const { name, version } = chrome.runtime.getManifest()
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle')

  useEffect(() => {
    void loadSettings().then(setSettings)
  }, [])

  /**
   * Patches are built from what is *stored*, not from React state.
   *
   * A nested patch assembled from a stale `settings` snapshot replaces the whole nested
   * object, so two toggles inside one storage round trip would drop the first. A failure
   * is surfaced rather than swallowed: an unhandled rejection leaves the checkbox where
   * the user clicked it and nothing says the setting did not persist.
   */
  const update = async (build: (current: Settings) => Partial<Settings>) => {
    try {
      const current = await loadSettings()
      setSettings(await saveSettings(build(current)))
      setStatus('saved')
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1500)
    } catch (error) {
      console.warn('[country-made-in] could not save settings', error)
      setStatus('failed')
      setSettings(await loadSettings().catch(() => settings))
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8 font-sans text-slate-800">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">{name} — settings</h1>
        <span
          className={`text-xs ${status === 'failed' ? 'text-red-700' : 'text-emerald-700'}`}
          role="status"
        >
          {status === 'saved' ? 'Saved' : status === 'failed' ? 'Could not save' : ''}
        </span>
      </div>

      <Section title="Marketplaces">
        <p className="text-xs text-slate-500">
          The extension only ever reads these nine Amazon sites. Turning one off stops it running
          there entirely.
        </p>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {ALL_MARKETPLACES.map((marketplace: Marketplace) => (
            <Check
              key={marketplace}
              label={marketplace}
              checked={settings.marketplaces[marketplace] !== false}
              onChange={(next) =>
                void update((current) => ({
                  marketplaces: { ...current.marketplaces, [marketplace]: next },
                }))
              }
            />
          ))}
        </div>
      </Section>

      <Section title="Badges on search results">
        <p className="text-xs text-slate-500">
          Search result tiles carry no origin information, so a badge there can only invite a wider
          search — it is never an answer.
        </p>
        {DENSITY.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="listingBadges"
              checked={settings.listingBadges === option.value}
              onChange={() => void update(() => ({ listingBadges: option.value }))}
              className="mt-0.5"
            />
            <span>
              <span className="text-slate-800">{option.label}</span>
              <span className="block text-xs text-slate-500">{option.detail}</span>
            </span>
          </label>
        ))}
      </Section>

      <Section title="Wider search">
        <Check
          label="Ask before every wider search"
          detail="A wider search reads other sites and needs your permission. Leave this on to be asked each time."
          checked={settings.confirmDeepSearch}
          onChange={(next) => void update(() => ({ confirmDeepSearch: next }))}
        />
      </Section>

      <Section title="Sources">
        <p className="text-xs text-slate-500">
          Where origin claims may be read from. Turning one off removes its evidence from every
          verdict.
        </p>
        {SOURCES.map((source) => (
          <Check
            key={source.id}
            label={source.label}
            detail={source.detail}
            checked={settings.sources[source.id] !== false}
            onChange={(next) =>
              void update((current) => ({
                sources: { ...current.sources, [source.id]: next },
              }))
            }
          />
        ))}
      </Section>

      <Attribution version={version} />
    </main>
  )
}
