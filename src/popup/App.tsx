export function App() {
  // Read inside the component, not at module scope: a module-level `chrome.*` call
  // runs on import, so anything it throws happens before React can mount and the
  // whole panel comes up blank with no clue as to why.
  const { name, version } = chrome.runtime.getManifest()

  return (
    <main className="w-72 space-y-1 p-4 font-sans text-sm text-slate-800">
      <h1 className="text-base font-semibold">{name}</h1>
      <p className="text-slate-600">Extension loaded — version {version}.</p>
      <p className="text-slate-500">Origin detection arrives in a later release.</p>
    </main>
  )
}
