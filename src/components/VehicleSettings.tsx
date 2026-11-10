import { useState, type ReactNode } from 'react'
import { formatClock, formatDate, resolveClock } from '../obc/display'
import type { UnitSystem } from '../protocol'
import { useVehicleStore } from '../store/vehicleStore'

export function VehicleSettings({ onDone }: { onDone: () => void }) {
  const units = useVehicleStore((state) => state.units)
  const clockFormat = useVehicleStore((state) => state.clockFormat)
  const toggleUnits = useVehicleStore((state) => state.toggleUnits)
  const setClockFormat = useVehicleStore((state) => state.setClockFormat)
  const setObcClock = useVehicleStore((state) => state.setObcClock)
  const [draft, setDraft] = useState(() => {
    const state = useVehicleStore.getState()
    const seed = resolveClock(state.obcData.time, state.obcData.date, state.obcClockAt, Date.now())
    return {
      hour: seed.getHours(),
      minute: seed.getMinutes(),
      day: seed.getDate(),
      month: seed.getMonth() + 1,
      year: seed.getFullYear(),
    }
  })

  const preview = new Date(draft.year, draft.month - 1, draft.day, draft.hour, draft.minute)
  const chooseUnits = (next: UnitSystem) => {
    if (next !== units) toggleUnits()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-3">
      <ChoiceRow label="Distance">
        <Choice label="km" selected={units === 'metric'} onSelect={() => chooseUnits('metric')} />
        <Choice label="miles" selected={units === 'imperial'} onSelect={() => chooseUnits('imperial')} />
      </ChoiceRow>
      <ChoiceRow label="Consumpt.">
        <Choice label="l/100km" selected={units === 'metric'} onSelect={() => chooseUnits('metric')} />
        <Choice label="mpg" selected={units === 'imperial'} onSelect={() => chooseUnits('imperial')} />
      </ChoiceRow>
      <ChoiceRow label="Temperature">
        <Choice label="°C" selected={units === 'metric'} onSelect={() => chooseUnits('metric')} />
        <Choice label="°F" selected={units === 'imperial'} onSelect={() => chooseUnits('imperial')} />
      </ChoiceRow>
      <ChoiceRow label="Clock">
        <Choice label="24h" selected={clockFormat === '24h'} onSelect={() => setClockFormat('24h')} />
        <Choice label="12h" selected={clockFormat === '12h'} onSelect={() => setClockFormat('12h')} />
      </ChoiceRow>
      <div className="flex flex-wrap items-center gap-2">
        <StepButton label="Hour −" onClick={() => setDraft((current) => ({ ...current, hour: wrap(current.hour - 1, 0, 23) }))} />
        <span className="min-w-28 text-center text-3xl font-semibold tabular-nums">{formatClock(preview, clockFormat)}</span>
        <StepButton label="Hour +" onClick={() => setDraft((current) => ({ ...current, hour: wrap(current.hour + 1, 0, 23) }))} />
        <StepButton label="Min −" onClick={() => setDraft((current) => ({ ...current, minute: wrap(current.minute - 1, 0, 59) }))} />
        <StepButton label="Min +" onClick={() => setDraft((current) => ({ ...current, minute: wrap(current.minute + 1, 0, 59) }))} />
        {clockFormat === '12h' ? (
          <StepButton
            label={draft.hour >= 12 ? 'PM' : 'AM'}
            onClick={() => setDraft((current) => ({ ...current, hour: (current.hour + 12) % 24 }))}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DateStepper
          label="Day"
          value={draft.day}
          onChange={(day) => setDraft((current) => ({ ...current, day }))}
          max={daysInMonth(draft.year, draft.month)}
        />
        <DateStepper
          label="Month"
          value={draft.month}
          onChange={(month) =>
            setDraft((current) => {
              const max = daysInMonth(current.year, month)
              return { ...current, month, day: Math.min(current.day, max) }
            })
          }
          max={12}
        />
        <DateStepper
          label="Year"
          value={draft.year}
          onChange={(year) =>
            setDraft((current) => {
              const max = daysInMonth(year, current.month)
              return { ...current, year, day: Math.min(current.day, max) }
            })
          }
          min={1993}
          max={2092}
        />
        <span className="text-xl tabular-nums">{formatDate(preview, clockFormat)}</span>
      </div>
      <button
        type="button"
        onClick={() => {
          setObcClock({ ...draft, format: clockFormat })
          onDone()
        }}
        className="mt-auto min-h-14 min-w-12 self-start rounded-2xl bg-mint px-8 text-lg font-semibold text-black transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        Set clock
      </button>
    </div>
  )
}

function ChoiceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-36 text-sm font-medium uppercase tracking-[0.16em] text-muted">{label}</span>
      <div className="flex flex-1 gap-2">{children}</div>
    </div>
  )
}

function Choice({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`min-h-12 min-w-24 flex-1 rounded-2xl px-4 text-lg font-semibold transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
        selected ? 'bg-mint text-black shadow-sm' : 'bg-chip text-ink hover:bg-chip'
      }`}
    >
      {label}
    </button>
  )
}

function StepButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-12 min-w-12 rounded-2xl bg-chip px-3 text-base font-semibold text-ink transition hover:bg-chip active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
    >
      {label}
    </button>
  )
}

function DateStepper({
  label,
  value,
  min = 1,
  max,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <StepButton label={`${label} −`} onClick={() => onChange(wrap(value - 1, min, max))} />
      <span className="min-w-16 text-center text-2xl font-semibold tabular-nums">{value.toString().padStart(2, '0')}</span>
      <StepButton label={`${label} +`} onClick={() => onChange(wrap(value + 1, min, max))} />
    </div>
  )
}

function wrap(value: number, min: number, max: number): number {
  if (value > max) return min
  if (value < min) return max
  return value
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}
