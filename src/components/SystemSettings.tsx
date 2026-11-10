export function SystemSettings({
  dark,
  brightness,
  onDark,
  onBrightness,
}: {
  dark: boolean
  brightness: number
  onDark: (enabled: boolean) => void
  onBrightness: (value: number) => void
}) {
  return (
    <section className="flex h-full min-h-0 flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card">
      <div>
        <p className="text-sm font-medium text-muted">Settings</p>
        <h2 className="text-2xl font-semibold text-ink">Display</h2>
      </div>
      <div className="flex min-h-16 items-center justify-between gap-4 rounded-2xl bg-chip px-4 py-3">
        <div>
          <p className="text-base font-semibold text-ink">Dark mode</p>
          <p className="text-sm text-muted">{dark ? 'Dark cabin' : 'Light cabin'}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={dark}
          aria-label="Dark mode"
          onClick={() => onDark(!dark)}
          className={`relative h-8 w-14 shrink-0 rounded-full transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
            dark ? 'bg-mint' : 'bg-slate-300'
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition ${
              dark ? 'left-7' : 'left-1'
            }`}
          />
        </button>
      </div>
      <label className="flex min-h-16 flex-col justify-center gap-3 rounded-2xl bg-chip px-4 py-3">
        <span className="flex items-baseline justify-between">
          <span className="text-base font-semibold text-ink">Screen brightness</span>
          <span className="text-sm tabular-nums text-muted">{brightness}%</span>
        </span>
        <input
          type="range"
          min={40}
          max={100}
          step={1}
          value={brightness}
          aria-label="Screen brightness"
          onChange={(event) => onBrightness(Number(event.target.value))}
          className="h-12 w-full cursor-pointer"
        />
      </label>
    </section>
  )
}
