import { badgeDetail, badgeState } from '../content/badge-state'
import type { Claim, ClaimKind, Evidence, OriginVerdict } from '../shared/origin'

const KIND_LABEL: Record<ClaimKind, string> = {
  manufactured: 'Made in',
  'brand-origin': 'Brand from',
  'shipped-from': 'Shipped from',
}

const KIND_ORDER: ClaimKind[] = ['manufactured', 'brand-origin', 'shipped-from']

const formatDate = (iso: string): string => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString()
}

function ClaimRow({ kind, claim }: { kind: ClaimKind; claim: Claim }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-slate-600">{KIND_LABEL[kind]}</span>
      <span className="text-right">
        <span className="font-medium text-slate-900">
          {claim.country.flag} {claim.country.name}
        </span>
        <span className="block text-xs text-slate-500">
          {claim.confidence} confidence · {claim.agreement}
        </span>
        {claim.alternatives.length > 0 && (
          <span className="block text-xs text-amber-700">
            also claimed: {claim.alternatives.map((c) => `${c.flag} ${c.name}`).join(', ')}
          </span>
        )}
      </span>
    </li>
  )
}

function EvidenceRow({ item }: { item: Evidence }) {
  return (
    <li className="border-t border-slate-200 py-2 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-slate-700">{item.sourceLabel}</span>
        <span className="shrink-0 text-slate-400">{formatDate(item.retrievedAt)}</span>
      </div>
      {item.quote !== null && (
        // Verbatim, so the user can compare it against the page rather than trust us.
        <blockquote className="mt-0.5 border-l-2 border-slate-300 pl-2 text-slate-600 italic">
          “{item.quote}”
        </blockquote>
      )}
      <div className="mt-0.5 flex items-baseline justify-between gap-2 text-slate-500">
        <span>
          {item.country ? `${item.country.flag} ${item.country.name}` : 'no country read'} ·{' '}
          {KIND_LABEL[item.kind]} · {item.confidence}
        </span>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-sky-700 underline"
          >
            check
          </a>
        )}
      </div>
    </li>
  )
}

export interface PanelProps {
  verdict: OriginVerdict | null
  onClose: () => void
  /** Plan 05. Absent until the deep tier exists. */
  onSearchWider?: () => void
}

export function Panel({ verdict, onClose, onSearchWider }: PanelProps) {
  const state = badgeState(verdict)
  const claims = verdict ? KIND_ORDER.filter((k) => verdict.claims[k]) : []

  return (
    <div className="w-80 rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800 shadow-lg">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Where is this made?</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="cursor-pointer px-1 text-slate-400 hover:text-slate-700"
        >
          ✕
        </button>
      </div>

      {claims.length > 0 ? (
        <ul className="mt-2 divide-y divide-slate-100">
          {claims.map((kind) => (
            <ClaimRow key={kind} kind={kind} claim={verdict!.claims[kind]!} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-slate-600">{badgeDetail(state)}</p>
      )}

      {verdict && verdict.evidence.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-semibold text-slate-500 uppercase">Evidence</h3>
          <ul className="mt-1">
            {verdict.evidence.map((item, i) => (
              <EvidenceRow key={`${item.sourceId}-${i}`} item={item} />
            ))}
          </ul>
        </>
      )}

      {onSearchWider && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onSearchWider}
            className="w-full cursor-pointer rounded border border-sky-300 bg-sky-50 px-2 py-1.5 text-xs font-medium text-sky-900"
          >
            Search wider
          </button>
          {/* Stated before Chrome's prompt appears, not after — the prompt is the
              consequence of this button, and the user should know that first. */}
          <p className="mt-1 text-xs text-slate-500">
            Looks beyond this page. Chrome will ask permission to read other sites, and the search
            runs only after you allow it.
          </p>
        </div>
      )}

      <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
        Origin data on Amazon is supplied by the seller. It is often absent, sometimes stale and
        occasionally wrong. This shows what the listing says — it cannot verify it.
      </p>
    </div>
  )
}
