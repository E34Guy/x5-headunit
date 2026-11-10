import { useVehicleStore } from '../store/vehicleStore'

const ACCENT = '#ff6600'
const TRACK = 'var(--track)'
const WARN = '#d64545'

export function GaugeCluster({ columns = 4 }: { columns?: 2 | 4 }) {
  const telemetry = useVehicleStore((state) => state.telemetry)
  return (
    <section className={`grid h-full min-h-0 gap-3 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-4'}`}>
      <Dial label="RPM" value={telemetry.rpm} unit="rpm" max={7000} accent={ACCENT} />
      <Dial label="Speed" value={telemetry.speedKmh} unit="km/h" max={260} accent={ACCENT} />
      <Dial
        label="Coolant"
        value={telemetry.coolantC}
        unit="°C"
        max={140}
        accent={telemetry.coolantC >= 110 ? WARN : ACCENT}
      />
      <Dial
        label="Fuel"
        value={telemetry.fuelPercent}
        unit="%"
        max={100}
        accent={telemetry.fuelPercent < 15 ? WARN : ACCENT}
      />
    </section>
  )
}

function Dial({
  label,
  value,
  unit,
  max,
  accent,
}: {
  label: string
  value: number
  unit: string
  max: number
  accent: string
}) {
  const safe = Number.isFinite(value) ? value : 0
  const pct = Math.max(0, Math.min(1, safe / max))
  const radius = 46
  const circumference = 2 * Math.PI * radius
  const arc = circumference * 0.75
  const text = Math.round(safe).toString()

  return (
    <article
      className="flex h-full min-w-0 flex-col items-center justify-between rounded-2xl bg-surface px-4 py-4 shadow-card"
      aria-label={`${label} ${text} ${unit}`}
    >
      <h3 className="text-sm font-medium uppercase tracking-[0.16em] text-muted">{label}</h3>
      <svg viewBox="0 0 120 78" className="h-28 w-full" aria-hidden="true">
        <g transform="translate(60 58) rotate(135)">
          <circle
            r={radius}
            fill="none"
            stroke={TRACK}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circumference - arc}`}
          />
          <circle
            r={radius}
            fill="none"
            stroke={accent}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${arc * pct} ${circumference}`}
          />
        </g>
      </svg>
      <p className="text-5xl font-semibold tabular-nums leading-none text-ink">{text}</p>
      <p className="text-sm text-muted">{unit}</p>
    </article>
  )
}
