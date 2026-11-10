import { type CarAction, IBUS_TRIGGERS } from '../protocol'
import { useVehicleStore } from '../store/vehicleStore'

/**
 * I-Bus trigger map — unverified E53-style placeholders.
 * Lock all is `3F 05 00 0C 4F xx`. On send, `xx` becomes the XOR checksum and the length byte is set to match.
 * These were not confirmed against a specific vehicle.
 */
const TRIGGER_ROWS: readonly { action: CarAction; label: string }[] = [
  { action: 'lock-all', label: 'Lock all' },
  { action: 'unlock-all', label: 'Unlock all' },
  { action: 'front-windows-up', label: 'Front windows up' },
  { action: 'front-windows-down', label: 'Front windows down' },
  { action: 'rear-windows-up', label: 'Rear windows up' },
  { action: 'rear-windows-down', label: 'Rear windows down' },
  { action: 'interior-light-on', label: 'Interior light on' },
  { action: 'interior-light-off', label: 'Interior light off' },
  { action: 'parking-lights-on', label: 'Parking lights on' },
  { action: 'parking-lights-off', label: 'Parking lights off' },
]

export function CarControls({ embedded = false }: { embedded?: boolean }) {
  const controls = useVehicleStore((state) => state.controls)
  const applyControl = useVehicleStore((state) => state.applyControl)

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-2xl bg-surface p-4 shadow-card">
      <h2 className="text-xl font-semibold text-ink">Controls</h2>
      <div className={`grid min-h-0 gap-2 ${embedded ? 'flex-1 grid-cols-1 grid-rows-5' : 'grid-cols-2'}`}>
        <BigToggle
          label="Locks"
          active={controls.doorsLocked}
          activeText="Locked"
          inactiveText="Unlocked"
          frame={IBUS_TRIGGERS[controls.doorsLocked ? 'unlock-all' : 'lock-all']}
          onToggle={() => applyControl(controls.doorsLocked ? 'unlock-all' : 'lock-all')}
        />
        <BigToggle
          label="Front windows"
          active={controls.frontWindowsUp}
          activeText="Up"
          inactiveText="Down"
          frame={IBUS_TRIGGERS[controls.frontWindowsUp ? 'front-windows-down' : 'front-windows-up']}
          onToggle={() =>
            applyControl(controls.frontWindowsUp ? 'front-windows-down' : 'front-windows-up')
          }
        />
        <BigToggle
          label="Rear windows"
          active={controls.rearWindowsUp}
          activeText="Up"
          inactiveText="Down"
          frame={IBUS_TRIGGERS[controls.rearWindowsUp ? 'rear-windows-down' : 'rear-windows-up']}
          onToggle={() =>
            applyControl(controls.rearWindowsUp ? 'rear-windows-down' : 'rear-windows-up')
          }
        />
        <BigToggle
          label="Interior light"
          active={controls.interiorLight}
          activeText="On"
          inactiveText="Off"
          frame={IBUS_TRIGGERS[controls.interiorLight ? 'interior-light-off' : 'interior-light-on']}
          onToggle={() =>
            applyControl(controls.interiorLight ? 'interior-light-off' : 'interior-light-on')
          }
        />
        <BigToggle
          label="Parking lights"
          active={controls.parkingLights}
          activeText="On"
          inactiveText="Off"
          frame={IBUS_TRIGGERS[controls.parkingLights ? 'parking-lights-off' : 'parking-lights-on']}
          onToggle={() =>
            applyControl(controls.parkingLights ? 'parking-lights-off' : 'parking-lights-on')
          }
        />
      </div>
      {embedded ? null : (
      <div className="mt-auto min-h-0 overflow-y-auto">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">
          I-Bus triggers
        </p>
        <ul className="space-y-1">
          {TRIGGER_ROWS.map((row) => (
            <li key={row.action} className="font-mono text-xs leading-5 text-muted">
              {row.label} {IBUS_TRIGGERS[row.action]}
            </li>
          ))}
        </ul>
      </div>
      )}
    </section>
  )
}

function BigToggle({
  label,
  active,
  activeText,
  inactiveText,
  frame,
  onToggle,
}: {
  label: string
  active: boolean
  activeText: string
  inactiveText: string
  frame: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={frame}
      className={`flex h-full min-h-12 min-w-12 flex-col items-start justify-center rounded-2xl px-4 text-left transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
        active ? 'bg-mint text-black shadow-sm' : 'bg-chip text-ink hover:bg-chip'
      }`}
    >
      <span className="text-lg font-semibold leading-tight">{label}</span>
      <span className={`text-base ${active ? 'text-black/70' : 'text-muted'}`}>
        {active ? activeText : inactiveText}
      </span>
    </button>
  )
}
