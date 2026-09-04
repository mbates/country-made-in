const { name } = chrome.runtime.getManifest()

export function App() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8 font-sans text-slate-800">
      <h1 className="text-xl font-semibold">{name} — settings</h1>
      <p className="text-slate-600">There is nothing to configure yet.</p>
      <footer className="border-t border-slate-200 pt-4 text-sm text-slate-500">
        Built by{' '}
        <a
          className="underline"
          href="https://bates-solutions.com"
          target="_blank"
          rel="noreferrer"
        >
          Bates Solutions Inc
        </a>
      </footer>
    </main>
  )
}
