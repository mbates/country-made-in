import { LINKS, PUBLISHER } from './links'

/** Shared footer: who made this, which version, and where to complain. */
export function Attribution({ version }: { version: string }) {
  return (
    <footer className="border-t border-slate-200 pt-2 text-xs text-slate-500">
      <p>
        Built by{' '}
        <a className="underline" href={LINKS.homepage} target="_blank" rel="noreferrer">
          {PUBLISHER}
        </a>{' '}
        · v{version}
      </p>
      <p className="mt-0.5">
        <a className="underline" href={LINKS.repo} target="_blank" rel="noreferrer">
          Source
        </a>{' '}
        ·{' '}
        <a className="underline" href={LINKS.issues} target="_blank" rel="noreferrer">
          Report a problem
        </a>
      </p>
    </footer>
  )
}
