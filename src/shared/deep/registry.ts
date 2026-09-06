import type { OriginSource } from './source'

/**
 * The sources the wider search will run.
 *
 * **Deliberately empty.** Plan 05's first story is a gate: measure each candidate's hit
 * rate against the fixture corpus before writing an adapter for it, and record the
 * numbers in `SOURCE-COVERAGE.md` so a rejected source is not re-litigated later.
 * The corpus is not yet large enough to run that measurement, so no adapter has earned
 * its place.
 *
 * Everything around this — permission handling, orchestration, streaming, merging — is
 * built and tested against fakes, so an adapter that passes the gate is a small addition
 * rather than a new subsystem.
 *
 * With no sources registered the button asks for no permissions and reports honestly
 * that there was nothing to check.
 */
export const SOURCES: readonly OriginSource[] = []
