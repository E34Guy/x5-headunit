import type { UnitSystem } from '../protocol'

/** Statute mile. Shared by the cluster text parser and the on-screen unit conversion. */
export const KM_PER_MILE = 1.609344

/** US gallon, IKE consumption code 0b10. */
export const US_MPG_TO_L100 = 235.214583

/** Imperial gallon, IKE consumption code 0b01. */
export const UK_MPG_TO_L100 = 282.480936

export type ConsumptionUnit = 'l100' | 'mpg-us' | 'mpg-uk' | 'kml'

export function toDisplaySpeed(kmh: number, units: UnitSystem): number {
  return units === 'imperial' ? kmh / KM_PER_MILE : kmh
}

export function fromDisplaySpeed(value: number, units: UnitSystem): number {
  return units === 'imperial' ? value * KM_PER_MILE : value
}

export function toDisplayDistance(km: number, units: UnitSystem): number {
  return units === 'imperial' ? km / KM_PER_MILE : km
}

export function fromDisplayDistance(value: number, units: UnitSystem): number {
  return units === 'imperial' ? value * KM_PER_MILE : value
}

export function toDisplayTemp(celsius: number, units: UnitSystem): number {
  return units === 'imperial' ? (celsius * 9) / 5 + 32 : celsius
}

export function fromDisplayTemp(value: number, units: UnitSystem): number {
  return units === 'imperial' ? ((value - 32) * 5) / 9 : value
}

export function toDisplayConsumption(litresPer100km: number, units: UnitSystem): number {
  if (units === 'metric') return litresPer100km
  if (litresPer100km <= 0.1) return 0
  return US_MPG_TO_L100 / litresPer100km
}

export function fromDisplayConsumption(value: number, units: UnitSystem): number {
  if (units === 'metric') return value
  if (value <= 0.1) return 0
  return US_MPG_TO_L100 / value
}

export function consumptionToLitresPer100(value: number, unit: ConsumptionUnit): number {
  if (unit === 'l100') return value
  if (unit === 'kml') return value <= 0.1 ? 0 : 100 / value
  const factor = unit === 'mpg-uk' ? UK_MPG_TO_L100 : US_MPG_TO_L100
  return value <= 0.1 ? 0 : factor / value
}

export function speedLimitMax(units: UnitSystem): number {
  return units === 'imperial' ? 186 : 299
}
