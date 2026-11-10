import { useEffect, useState } from 'react'
import {
  formatClock,
  formatConsumption,
  formatDate,
  formatDistance,
  formatLimit,
  formatSpeed,
  formatTemp,
  formatTimer,
  resolveClock,
} from '../obc/display'
import { speedLimitMax, toDisplaySpeed } from '../obc/units'
import { useVehicleStore } from '../store/vehicleStore'
import { VehicleSettings } from './VehicleSettings'

type ObcTile = 'range' | 'temp' | 'clock' | 'cons1' | 'cons2' | 'avg' | 'limit' | 'distance' | 'timer'

export function OBCMenu({ title = 'Computer', onClose }: { title?: string; onClose?: () => void }) {
  const obcData = useVehicleStore((state) => state.obcData)
  const units = useVehicleStore((state) => state.units)
  const clockFormat = useVehicleStore((state) => state.clockFormat)
  const obcClockAt = useVehicleStore((state) => state.obcClockAt)
  const speed = useVehicleStore((state) => state.speed)
  const setSpeedLimit = useVehicleStore((state) => state.setSpeedLimit)
  const clearSpeedLimit = useVehicleStore((state) => state.clearSpeedLimit)
  const adoptSpeedLimit = useVehicleStore((state) => state.adoptSpeedLimit)
  const setTimerRunning = useVehicleStore((state) => state.setTimerRunning)
  const recalculateObc = useVehicleStore((state) => state.recalculateObc)
  const [page, setPage] = useState<'computer' | 'set'>('computer')
  const [selected, setSelected] = useState<ObcTile | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const displayLimit = Math.round(toDisplaySpeed(obcData.limit, units))
  const [draftLimit, setDraftLimit] = useState(displayLimit)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    setDraftLimit(displayLimit)
  }, [displayLimit])

  useEffect(() => {
    window.headunit?.sendObc({ kind: 'poll' })
  }, [])

  const clock = resolveClock(obcData.time, obcData.date, obcClockAt, now)
  const overLimit = obcData.limitEnabled && speed > obcData.limit

  return (
    <div className="flex h-full min-h-0 flex-col text-ink">
      <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-surface p-4 shadow-card">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line">
          <h2 className="text-xl font-semibold tracking-wide">{page === 'set' ? 'Set' : title}</h2>
          <p className="text-lg tabular-nums text-muted">{formatClock(clock, clockFormat, true)}</p>
          <div className="flex items-center gap-2">
            {page === 'computer' ? <SoftKey label="Set" onClick={() => setPage('set')} /> : null}
            {page === 'set' || onClose ? (
              <SoftKey
                label="Back"
                onClick={() => {
                  if (page === 'set') setPage('computer')
                  else onClose?.()
                }}
              />
            ) : null}
          </div>
        </header>
        {page === 'set' ? (
          <VehicleSettings onDone={() => setPage('computer')} />
        ) : (
          <>
            <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-3 gap-3 py-3">
              <Cell
                label="Range"
                value={formatDistance(obcData.range, units)}
                selected={selected === 'range'}
                onSelect={() => setSelected('range')}
              />
              <Cell
                label="Out. temp."
                value={formatTemp(obcData.outTemp, units)}
                selected={selected === 'temp'}
                onSelect={() => setSelected('temp')}
              />
              <Cell
                label="Clock"
                value={formatClock(clock, clockFormat)}
                detail={formatDate(clock, clockFormat)}
                selected={selected === 'clock'}
                onSelect={() => setPage('set')}
              />
              <Cell
                label="Consumpt. 1"
                value={formatConsumption(obcData.consumption1, units)}
                selected={selected === 'cons1'}
                onSelect={() => setSelected('cons1')}
              />
              <Cell
                label="Consumpt. 2"
                value={formatConsumption(obcData.consumption2, units)}
                selected={selected === 'cons2'}
                onSelect={() => setSelected('cons2')}
              />
              <Cell
                label="Avg. speed"
                value={formatSpeed(obcData.avgSpeed, units, 1)}
                selected={selected === 'avg'}
                onSelect={() => setSelected('avg')}
              />
              <Cell
                label="Limit"
                value={formatLimit(obcData.limit, obcData.limitEnabled, units)}
                detail={overLimit ? 'Limit reached' : obcData.limitEnabled ? 'On' : 'Off'}
                selected={selected === 'limit'}
                warn={overLimit}
                onSelect={() => setSelected('limit')}
              />
              <Cell
                label="Distance"
                value={formatDistance(obcData.distance, units)}
                selected={selected === 'distance'}
                onSelect={() => setSelected('distance')}
              />
              <Cell
                label="Timer"
                value={formatTimer(obcData.timer)}
                detail={obcData.timerRunning ? 'Running' : 'Stopped'}
                selected={selected === 'timer'}
                onSelect={() => setSelected('timer')}
              />
            </div>
            {selected === 'limit' || selected === 'cons1' || selected === 'cons2' || selected === 'avg' || selected === 'timer' ? (
            <footer className="flex shrink-0 flex-wrap items-center gap-2 pt-2">
              {selected === 'limit' ? (
                <LimitControls
                  draft={draftLimit}
                  unit={units === 'imperial' ? 'mph' : 'km/h'}
                  max={speedLimitMax(units)}
                  enabled={obcData.limitEnabled}
                  current={Math.round(toDisplaySpeed(speed, units))}
                  onDraft={setDraftLimit}
                  onSet={() => setSpeedLimit(draftLimit)}
                  onClear={clearSpeedLimit}
                  onCurrent={adoptSpeedLimit}
                />
              ) : null}
              {selected === 'cons1' || selected === 'cons2' || selected === 'avg' ? (
                <SoftKey
                  label="Recalculate"
                  onClick={() =>
                    recalculateObc(selected === 'cons1' ? 'consumption1' : selected === 'cons2' ? 'consumption2' : 'avgSpeed')
                  }
                />
              ) : null}
              {selected === 'timer' ? (
                <SoftKey
                  label={obcData.timerRunning ? 'Stop' : 'Start'}
                  onClick={() => setTimerRunning(!obcData.timerRunning)}
                />
              ) : null}
            </footer>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function LimitControls({
  draft,
  unit,
  max,
  enabled,
  current,
  onDraft,
  onSet,
  onClear,
  onCurrent,
}: {
  draft: number
  unit: string
  max: number
  enabled: boolean
  current: number
  onDraft: (value: number) => void
  onSet: () => void
  onClear: () => void
  onCurrent: () => void
}) {
  const step = (delta: number) => onDraft(Math.min(max, Math.max(1, draft + delta)))
  return (
    <>
      <SoftKey label="−5" onClick={() => step(-5)} />
      <SoftKey label="+5" onClick={() => step(5)} />
      <span className="min-w-24 text-center text-2xl font-semibold tabular-nums text-ink">
        {draft} {unit}
      </span>
      <SoftKey label="Set" onClick={onSet} />
      <SoftKey label="Clear" onClick={onClear} disabled={!enabled} />
      <SoftKey label="Current" onClick={onCurrent} disabled={current < 1} />
    </>
  )
}

function Cell({
  label,
  value,
  detail,
  selected,
  warn = false,
  onSelect,
}: {
  label: string
  value: string
  detail?: string
  selected: boolean
  warn?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex h-full min-h-12 min-w-12 flex-col items-start justify-center gap-1 rounded-2xl px-4 py-3 text-left transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
        selected
          ? 'bg-mint text-black shadow-sm'
          : warn
            ? 'border border-red-300 bg-red-50 text-ink'
            : 'bg-chip text-ink hover:bg-chip'
      }`}
    >
      <span
        className={`text-sm font-medium uppercase tracking-[0.12em] ${selected ? 'text-black/70' : 'text-muted'}`}
      >
        {label}
      </span>
      <span className="text-[clamp(2rem,6vh,3.5rem)] font-semibold leading-none tabular-nums">{value}</span>
      {detail ? (
        <span className={`text-sm ${selected ? 'text-black/60' : warn ? 'text-red-600' : 'text-muted'}`}>
          {detail}
        </span>
      ) : null}
    </button>
  )
}

function SoftKey({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-12 min-w-12 rounded-2xl bg-chip px-4 text-base font-semibold text-ink transition hover:bg-chip enabled:active:scale-95 enabled:active:bg-mint enabled:active:text-black disabled:bg-chip disabled:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
    >
      {label}
    </button>
  )
}
