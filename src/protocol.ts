export const IpcChannel = {
  telemetry: 'headunit:telemetry',
  carAction: 'headunit:car-action',
  eqBand: 'headunit:eq-band',
  roomPreset: 'headunit:room-preset',
  masterVolume: 'headunit:master-volume',
  inpaOpen: 'headunit:inpa-open',
  inpaClose: 'headunit:inpa-close',
  inpaResize: 'headunit:inpa-resize',
  obcCommand: 'headunit:obc-command',
  obcUpdate: 'headunit:obc-update',
  gpsUpdate: 'headunit:gps-update',
} as const

/** Live GNSS fix from the USB GPS service. Speed is km/h; heading is degrees from true north. */
export interface GpsFix {
  latitude: number
  longitude: number
  heading: number
  speed: number
}

/** Partial fix from a single NMEA sentence (GGA may omit speed/heading). */
export type GpsUpdate = Pick<GpsFix, 'latitude' | 'longitude'> & Partial<Pick<GpsFix, 'heading' | 'speed'>>

export interface Telemetry {
  rpm: number
  speedKmh: number
  coolantC: number
  fuelPercent: number
  ibusConnected: boolean
  canConnected: boolean
  canSimulated: boolean
  lastIbusFrame: string | null
}

export const CAR_ACTIONS = [
  'lock-all',
  'unlock-all',
  'front-windows-up',
  'front-windows-down',
  'rear-windows-up',
  'rear-windows-down',
  'interior-light-on',
  'interior-light-off',
  'parking-lights-on',
  'parking-lights-off',
] as const

export type CarAction = (typeof CAR_ACTIONS)[number]

/**
 * Unverified E53-style I-Bus placeholders. Not confirmed against a specific vehicle.
 * Lock all is `3F 05 00 0C 4F xx`. On send, `xx` becomes the XOR checksum and the length byte is set to match.
 */
export const IBUS_TRIGGERS = {
  'lock-all': '3F 05 00 0C 4F xx',
  'unlock-all': '3F 04 00 0C 03 xx',
  'front-windows-up': '3F 04 00 7A 01 xx',
  'front-windows-down': '3F 04 00 7A 00 xx',
  'rear-windows-up': '3F 04 00 7B 01 xx',
  'rear-windows-down': '3F 04 00 7B 00 xx',
  'interior-light-on': '3F 04 00 5C 01 xx',
  'interior-light-off': '3F 04 00 5C 00 xx',
  'parking-lights-on': '3F 04 00 5B 01 xx',
  'parking-lights-off': '3F 04 00 5B 00 xx',
} as const satisfies Record<CarAction, string>

export const EQ_BANDS = [
  { id: 'hz63', label: '63Hz' },
  { id: 'hz160', label: '160Hz' },
  { id: 'hz400', label: '400Hz' },
  { id: 'hz1000', label: '1kHz' },
  { id: 'hz2500', label: '2.5kHz' },
  { id: 'hz6300', label: '6.3kHz' },
  { id: 'hz16000', label: '16kHz' },
] as const

export type EqBandId = (typeof EQ_BANDS)[number]['id']

export type EqGains = [number, number, number, number, number, number, number]

export const ROOM_PRESETS = ['driver', 'all', 'rear'] as const

export type RoomPreset = (typeof ROOM_PRESETS)[number]

export interface EqBandCommand {
  band: EqBandId
  gainDb: number
}

export interface InpaBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface InpaEmbedResult {
  ok: boolean
  embedded: boolean
  mock: boolean
  reason?: string
}

/** Canonical OBC numbers are metric: km, °C, L/100km, km/h. `time` is 24h `HH:mm`. `date` is `YYYY-MM-DD`. */
export interface ObcData {
  range: number
  outTemp: number
  consumption1: number
  consumption2: number
  avgSpeed: number
  limit: number
  limitEnabled: boolean
  distance: number
  /** Stopwatch elapsed seconds. */
  timer: number
  timerRunning: boolean
  time: string
  date: string
}

export type UnitSystem = 'metric' | 'imperial'

export type ClockFormat = '24h' | '12h'

export type ObcRecalcProperty = 'consumption1' | 'consumption2' | 'avgSpeed'

export type ObcCommand =
  | { kind: 'poll' }
  | { kind: 'set-time'; hour: number; minute: number; format: ClockFormat }
  | { kind: 'set-date'; day: number; month: number; year: number }
  | { kind: 'set-limit'; limit: number }
  | { kind: 'limit'; action: 'on' | 'off' | 'current' }
  | { kind: 'recalculate'; property: ObcRecalcProperty }
  | { kind: 'timer'; running: boolean }
  | { kind: 'set-units'; units: UnitSystem }
  | { kind: 'set-clock-format'; format: ClockFormat }

export interface ObcSnapshot {
  data?: Partial<ObcData>
  units?: UnitSystem
  clockFormat?: ClockFormat
}

export interface ObcClockInput {
  hour: number
  minute: number
  day: number
  month: number
  year: number
  format: ClockFormat
}

export interface HeadunitApi {
  subscribeTelemetry: (listener: (telemetry: Telemetry) => void) => () => void
  sendCarControl: (action: CarAction) => void
  setEqBand: (band: EqBandId, gainDb: number) => void
  setRoomPreset: (preset: RoomPreset) => void
  setMasterVolume: (volume: number) => void
  openInpa: (bounds: InpaBounds) => Promise<InpaEmbedResult>
  closeInpa: () => Promise<InpaEmbedResult>
  resizeInpa: (bounds: InpaBounds) => Promise<InpaEmbedResult>
  sendObc: (command: ObcCommand) => void
  subscribeObc: (listener: (update: ObcSnapshot) => void) => () => void
  subscribeGps: (listener: (fix: GpsUpdate) => void) => () => void
}

export function isCarAction(value: unknown): value is CarAction {
  return typeof value === 'string' && CAR_ACTIONS.some((action) => action === value)
}

export function isEqBandId(value: unknown): value is EqBandId {
  return typeof value === 'string' && EQ_BANDS.some((band) => band.id === value)
}

export function isRoomPreset(value: unknown): value is RoomPreset {
  return typeof value === 'string' && ROOM_PRESETS.some((preset) => preset === value)
}

export function isTelemetry(value: unknown): value is Telemetry {
  if (!isRecord(value)) return false
  return (
    isFiniteNumber(value.rpm) &&
    isFiniteNumber(value.speedKmh) &&
    isFiniteNumber(value.coolantC) &&
    isFiniteNumber(value.fuelPercent) &&
    typeof value.ibusConnected === 'boolean' &&
    typeof value.canConnected === 'boolean' &&
    typeof value.canSimulated === 'boolean' &&
    (value.lastIbusFrame === null || typeof value.lastIbusFrame === 'string')
  )
}

export function isEqBandCommand(value: unknown): value is EqBandCommand {
  if (!isRecord(value)) return false
  return isEqBandId(value.band) && isFiniteNumber(value.gainDb)
}

export function isInpaBounds(value: unknown): value is InpaBounds {
  if (!isRecord(value)) return false
  return (
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height)
  )
}

export function isObcCommand(value: unknown): value is ObcCommand {
  if (!isRecord(value) || typeof value.kind !== 'string') return false
  switch (value.kind) {
    case 'poll':
      return true
    case 'set-time':
      return isHour(value.hour) && isMinute(value.minute) && isClockFormat(value.format)
    case 'set-date':
      return isCalendarDate(value.day, value.month, value.year)
    case 'set-limit':
      return isFiniteNumber(value.limit) && value.limit >= 1 && value.limit <= 299
    case 'limit':
      return value.action === 'on' || value.action === 'off' || value.action === 'current'
    case 'recalculate':
      return value.property === 'consumption1' || value.property === 'consumption2' || value.property === 'avgSpeed'
    case 'timer':
      return typeof value.running === 'boolean'
    case 'set-units':
      return isUnitSystem(value.units)
    case 'set-clock-format':
      return isClockFormat(value.format)
    default:
      return false
  }
}

export function isObcSnapshot(value: unknown): value is ObcSnapshot {
  if (!isRecord(value)) return false
  if (value.units !== undefined && !isUnitSystem(value.units)) return false
  if (value.clockFormat !== undefined && !isClockFormat(value.clockFormat)) return false
  return value.data === undefined || isRecord(value.data)
}

export function isUnitSystem(value: unknown): value is UnitSystem {
  return value === 'metric' || value === 'imperial'
}

export function isClockFormat(value: unknown): value is ClockFormat {
  return value === '24h' || value === '12h'
}

export function isInpaEmbedResult(value: unknown): value is InpaEmbedResult {
  if (!isRecord(value)) return false
  return (
    typeof value.ok === 'boolean' &&
    typeof value.embedded === 'boolean' &&
    typeof value.mock === 'boolean' &&
    (value.reason === undefined || typeof value.reason === 'string')
  )
}

export function isGpsUpdate(value: unknown): value is GpsUpdate {
  if (!isRecord(value)) return false
  if (!isFiniteNumber(value.latitude) || value.latitude < -90 || value.latitude > 90) return false
  if (!isFiniteNumber(value.longitude) || value.longitude < -180 || value.longitude > 180) return false
  if (value.heading !== undefined && !isFiniteNumber(value.heading)) return false
  if (value.speed !== undefined && (!isFiniteNumber(value.speed) || value.speed < 0)) return false
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isHour(value: unknown): value is number {
  return isWhole(value) && value >= 0 && value <= 23
}

function isMinute(value: unknown): value is number {
  return isWhole(value) && value >= 0 && value <= 59
}

function isCalendarDate(day: unknown, month: unknown, year: unknown): boolean {
  if (!isWhole(day) || !isWhole(month) || !isWhole(year)) return false
  if (year < 1993 || year > 2092 || month < 1 || month > 12) return false
  const maxDay = new Date(year, month, 0).getDate()
  return day >= 1 && day <= maxDay
}

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}
