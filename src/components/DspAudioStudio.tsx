import { EQ_BANDS, ROOM_PRESETS, type RoomPreset } from '../protocol'
import { useVehicleStore } from '../store/vehicleStore'

const PRESET_LABELS: Record<RoomPreset, string> = {
  driver: 'Driver',
  all: 'All',
  rear: 'Rear',
}

export function DspAudioStudio({ onBack }: { onBack: () => void }) {
  const gains = useVehicleStore((state) => state.audio.gains)
  const roomPreset = useVehicleStore((state) => state.audio.roomPreset)
  const masterVolume = useVehicleStore((state) => state.audio.masterVolume)
  const setEqBand = useVehicleStore((state) => state.setEqBand)
  const setRoomPreset = useVehicleStore((state) => state.setRoomPreset)
  const setMasterVolume = useVehicleStore((state) => state.setMasterVolume)

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-ink">Equalizer</h2>
        <button
          type="button"
          onClick={onBack}
          className="min-h-12 min-w-12 rounded-2xl bg-chip px-5 text-base font-semibold text-ink transition hover:bg-chip active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          Back
        </button>
      </header>
      <div className="flex flex-1 items-center">
        <div className="flex w-full items-end justify-between gap-2">
          {EQ_BANDS.map((band, index) => {
            const gain = gains[index] ?? 0
            return (
              <label
                key={band.id}
                className="flex min-h-12 min-w-12 flex-1 flex-col items-center gap-2 rounded-2xl px-1 py-2 transition hover:bg-chip"
              >
                <span className="text-sm font-medium tabular-nums text-ink">{gain}</span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={gain}
                  aria-label={`${band.label} gain`}
                  onChange={(event) => setEqBand(band.id, Number(event.target.value))}
                  className="h-48 min-h-12 w-12 cursor-pointer [direction:rtl] [writing-mode:vertical-lr]"
                />
                <span className="text-xs text-muted">{band.label}</span>
              </label>
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex min-h-12 flex-1 rounded-2xl bg-chip p-1">
          {ROOM_PRESETS.map((preset) => {
            const selected = preset === roomPreset
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setRoomPreset(preset)}
                className={`min-h-12 min-w-12 flex-1 rounded-xl text-base font-semibold transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
                  selected ? 'bg-mint text-black shadow-sm' : 'text-muted hover:bg-chip hover:text-ink'
                }`}
              >
                {PRESET_LABELS[preset]}
              </button>
            )
          })}
        </div>
        <label className="flex min-h-12 min-w-12 flex-1 items-center gap-3 rounded-2xl bg-chip px-4">
          <span className="text-sm font-medium text-muted">Vol</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={masterVolume}
            aria-label="Master volume"
            onChange={(event) => setMasterVolume(Number(event.target.value))}
            className="h-12 min-w-12 flex-1 cursor-pointer"
          />
          <span className="w-10 text-right text-sm font-medium tabular-nums text-ink">{masterVolume}</span>
        </label>
      </div>
    </section>
  )
}
