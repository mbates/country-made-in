import type { OriginSource, ProductSeed, SourceOutcome } from './source'

export interface DeepSearchOptions {
  /** How many sources may be in flight at once. */
  concurrency?: number
  /** Per-source budget. A slow source must not hold up the rest. */
  timeoutMs?: number
  /** Cancels the whole search — the user closed the panel, or navigated away. */
  signal?: AbortSignal
  /** Called as each source finishes, so the panel can show progress rather than a spinner. */
  onOutcome?: (outcome: SourceOutcome) => void
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

const DEFAULTS = { concurrency: 4, timeoutMs: 10_000 }

/**
 * Race a promise against a per-source timeout and the overall abort.
 *
 * The source gets its own `AbortSignal` so a well-behaved one stops work when the answer
 * is no longer wanted; one that ignores it is abandoned rather than waited for.
 */
async function withBudget<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  outer: AbortSignal | undefined,
  setTimeoutFn: typeof setTimeout,
  clearTimeoutFn: typeof clearTimeout
): Promise<{ ok: true; value: T } | { ok: false; reason: 'timeout' | 'aborted' | string }> {
  const controller = new AbortController()
  const onOuterAbort = () => controller.abort()
  outer?.addEventListener('abort', onOuterAbort, { once: true })

  let timer: ReturnType<typeof setTimeout> | null = null
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeoutFn(() => {
      controller.abort()
      resolve('timeout')
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([run(controller.signal), timedOut])
    if (result === 'timeout') return { ok: false, reason: 'timeout' }
    return { ok: true, value: result as T }
  } catch (error) {
    if (outer?.aborted) return { ok: false, reason: 'aborted' }
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  } finally {
    if (timer !== null) clearTimeoutFn(timer)
    outer?.removeEventListener('abort', onOuterAbort)
  }
}

/**
 * Run every applicable source and collect what they found.
 *
 * A source that throws, times out or is unreachable degrades the answer — it never ends
 * the search. That is the difference between "we checked six sources and four answered"
 * and a spinner that never resolves.
 *
 * Outcomes are reported as they land, in completion order, so the panel fills in
 * progressively. The returned array is in the same order.
 */
export async function runDeepSearch(
  sources: readonly OriginSource[],
  seed: ProductSeed,
  options: DeepSearchOptions = {}
): Promise<SourceOutcome[]> {
  const {
    concurrency = DEFAULTS.concurrency,
    timeoutMs = DEFAULTS.timeoutMs,
    signal,
    onOutcome,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  } = options

  const outcomes: SourceOutcome[] = []
  const report = (outcome: SourceOutcome) => {
    outcomes.push(outcome)
    try {
      onOutcome?.(outcome)
    } catch (error) {
      // A listener that throws is the caller's problem, not a reason to stop searching.
      console.warn('[country-made-in] deep-search listener threw', error)
    }
  }

  const queue = [...sources]

  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) return
      const source = queue.shift()
      if (!source) return

      let applies: boolean
      try {
        applies = source.applies(seed)
      } catch (error) {
        report({
          sourceId: source.id,
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        })
        continue
      }

      if (!applies) {
        report({ sourceId: source.id, status: 'skipped', reason: 'not applicable' })
        continue
      }

      const result = await withBudget(
        (sourceSignal) => source.search(seed, sourceSignal),
        timeoutMs,
        signal,
        setTimeoutFn,
        clearTimeoutFn
      )

      if (!result.ok) {
        if (result.reason === 'aborted') return
        report(
          result.reason === 'timeout'
            ? { sourceId: source.id, status: 'timeout' }
            : { sourceId: source.id, status: 'failed', reason: result.reason }
        )
        continue
      }

      report(
        result.value.length > 0
          ? { sourceId: source.id, status: 'found', evidence: result.value }
          : { sourceId: source.id, status: 'nothing' }
      )
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))
  return outcomes
}

/** Every distinct origin the applicable sources need permission for. */
export function requiredOrigins(sources: readonly OriginSource[], seed: ProductSeed): string[] {
  const origins = new Set<string>()
  for (const source of sources) {
    try {
      if (source.applies(seed)) for (const origin of source.origins) origins.add(origin)
    } catch {
      // A source that cannot decide is not one we ask permission for.
    }
  }
  return [...origins].sort()
}

/** Evidence from every source that found some, in completion order. */
export const evidenceFrom = (outcomes: readonly SourceOutcome[]) =>
  outcomes.flatMap((outcome) => (outcome.status === 'found' ? outcome.evidence : []))
