import type { ClockFormat, UnitSystem } from '../protocol'
import { toDisplayConsumption, toDisplayDistance, toDisplaySpeed, toDisplayTemp } from './units'

export function resolveClock(time: string, date: string, anchoredAt: number, now: number): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const clock = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match || !clock) return new Date(now)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(clock[1])
  const minute = Number(clock[2])
  const base = new Date(year, month - 1, day, hour, minute, 0, 0)
  if (Number.isNaN(base.getTime())) return new Date(now)
  return new Date(base.getTime() + (now - anchoredAt))
}

export function formatClock(date: Date, format: ClockFormat, withSeconds = false): string {
  const minute = pad(date.getMinutes())
  const second = withSeconds ? `:${pad(date.getSeconds())}` : ''
  if (format === '24h') return `${pad(date.getHours())}:${minute}${second}`
  const hour24 = date.getHours()
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12
  return `${hour12}:${minute}${second} ${suffix}`
}

/** 24-hour clocks use dd.mm.yyyy. 12-hour clocks use mm/dd/yyyy, matching the Mk4 Set menu. */
export function formatDate(date: Date, format: ClockFormat): string {
  const day = pad(date.getDate())
  const month = pad(date.getMonth() + 1)
  const year = date.getFullYear().toString()
  return format === '24h' ? `${day}.${month}.${year}` : `${month}/${day}/${year}`
}

export function formatDistance(km: number, units: UnitSystem): string {
  const value = Math.round(toDisplayDistance(km, units))
  return units === 'imperial' ? `${value} mi` : `${value} km`
}

export function formatSpeed(kmh: number, units: UnitSystem, digits = 0): string {
  const value = toDisplaySpeed(kmh, units)
  const text = digits > 0 ? value.toFixed(digits) : String(Math.round(value))
  return units === 'imperial' ? `${text} mph` : `${text} km/h`
}

export function formatTemp(celsius: number, units: UnitSystem): string {
  const value = toDisplayTemp(celsius, units)
  if (units === 'imperial') {
    const rounded = Math.round(value)
    return `${sign(rounded)}${rounded} °F`
  }
  const rounded = Math.round(value * 10) / 10
  return `${sign(rounded)}${rounded.toFixed(1)} °C`
}

export function formatConsumption(litresPer100km: number, units: UnitSystem): string {
  if (litresPer100km <= 0.1) return '---'
  const value = toDisplayConsumption(litresPer100km, units)
  return units === 'imperial' ? `${value.toFixed(1)} mpg` : `${value.toFixed(1)} l/100km`
}

export function formatLimit(kmh: number, enabled: boolean, units: UnitSystem): string {
  if (!enabled) return '---'
  return formatSpeed(kmh, units)
}

export function formatTimer(seconds: number): string {
  const safe = Math.max(0, seconds)
  if (safe < 60) return `${safe.toFixed(1)} SEC`
  const total = Math.floor(safe)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(secs)}`
  return `${minutes}:${pad(secs)} MIN`
}

export function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

function sign(value: number): string {
  return value > 0 ? '+' : ''
}
