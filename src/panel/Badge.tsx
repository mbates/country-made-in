import { badgeDetail, badgeLabel } from '../content/badge-state'
import type { BadgeState } from '../content/badge-state'

const TONE: Record<BadgeState['kind'], string> = {
  known: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  disputed: 'border-amber-300 bg-amber-50 text-amber-900',
  unknown: 'border-slate-300 bg-slate-50 text-slate-700',
  searching: 'border-sky-300 bg-sky-50 text-sky-900',
}

export interface BadgeProps {
  state: BadgeState
  onOpen: () => void
}

export function Badge({ state, onOpen }: BadgeProps) {
  const label = badgeLabel(state)
  const detail = badgeDetail(state)

  return (
    <button
      type="button"
      onClick={onOpen}
      title={detail}
      aria-label={`${label}. ${detail}. Open origin details.`}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TONE[state.kind]}`}
    >
      <span>{label}</span>
      <span aria-hidden="true" className="opacity-60">
        ⓘ
      </span>
    </button>
  )
}
