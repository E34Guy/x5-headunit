import { create } from 'zustand'

import { TRACKS, trackAt } from '../media/tracks'
import { fromDisplaySpeed, speedLimitMax, toDisplaySpeed } from '../obc/units'
import {
  type CarAction,
  type ClockFormat,
  EQ_BANDS,
  type EqBandId,
  type EqGains,
  type GpsFix,
  type GpsUpdate,
  type ObcClockInput,
  type ObcData,
  type ObcRecalcProperty,
  type ObcSnapshot,
  type RoomPreset,
  type Telemetry,
  type UnitSystem,
} from '../protocol'

export type { GpsFix }

/** Graphic EQ order for `eqBands` and `setEqBand` indexes. Gains are dB, from −12 to +12. */
export const EQ_BAND_LABELS = ['80Hz', '200Hz', '500Hz', '1kHz', '2kHz', '5kHz', '12kHz'] as const

export type EqBandIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type EqBands = [number, number, number, number, number, number, number]

export type DspSource = 'coaxial' | 'aux' | 'bluetooth'

export type WindowPosition = 'up' | 'down'

export interface WindowsState {
  front: WindowPosition
  rear: WindowPosition
}

export interface TelemetryState {
  /** Engine speed in rpm. */
  rpm: number
  /** Road speed in km/h. */
  speed: number
  /** Coolant temperature in °C. */
  coolantTemp: number
  /** Fuel level in percent. */
  fuelLevel: number
  /** Battery voltage in volts. */
  batteryVoltage: number
}

export interface GeoPoint {
  latitude: number
  longitude: number
}

export interface VehicleControls {
  doorsLocked: boolean
  frontWindowsUp: boolean
  rearWindowsUp: boolean
  interiorLight: boolean
  parkingLights: boolean
}

export interface VehicleState extends TelemetryState {
  masterVolume: number
  eqBands: EqBands
  dspSource: DspSource
  /** True while the doors are locked. */
  doorLocks: boolean
  windows: WindowsState
  /** True while the headlights are on. */
  headlights: boolean
  /** Client-side drive simulation. Defaults on so the cluster can run with no car attached. */
  isMockMode: boolean
  telemetry: Telemetry
  audio: {
    gains: EqGains
    roomPreset: RoomPreset
    masterVolume: number
  }
  controls: VehicleControls
  inpa: {
    open: boolean
    mock: boolean
  }
  obcData: ObcData
  /** km/h, L/100km, and °C, or mph, mpg, and °F. */
  units: UnitSystem
  clockFormat: ClockFormat
  /** `Date.now()` when `obcData.time` and `obcData.date` were last anchored. */
  obcClockAt: number
  obcFromCluster: boolean
  updateTelemetry: (data: Partial<TelemetryState>) => void
  setMasterVolume: (volume: number) => void
  /**
   * Pass a band index (0 = 80Hz … 6 = 12kHz) to change `eqBands`.
   * Pass a hardware band id to change the I-Bus EQ the DSP panel sends to the car.
   */
  setEqBand: (bandIndex: number | EqBandId, value: number) => void
  toggleDoorLocks: () => void
  toggleMockMode: (enabled: boolean) => void
  startMockStream: () => void
  stopMockStream: () => void
  setDspSource: (source: DspSource) => void
  setHeadlights: (on: boolean) => void
  setWindows: (windows: Partial<WindowsState>) => void
  setTelemetry: (telemetry: Telemetry) => void
  setRoomPreset: (preset: RoomPreset) => void
  toggleInpa: () => void
  setInpaMock: (mock: boolean) => void
  applyControl: (action: CarAction) => void
  updateOBCData: (data: Partial<ObcData>) => void
  applyClusterObc: (update: ObcSnapshot) => void
  setSpeedLimit: (limit: number) => void
  clearSpeedLimit: () => void
  adoptSpeedLimit: () => void
  toggleUnits: () => void
  setClockFormat: (format: ClockFormat) => void
  setObcClock: (input: ObcClockInput) => void
  setTimerRunning: (running: boolean) => void
  recalculateObc: (property: ObcRecalcProperty) => void
  gps: GpsFix
  /** True after a USB GPS fix arrives; stops the Toronto mock route. */
  gpsLive: boolean
  /** Live vehicle position. In mock mode this follows Dufferin Street past Yorkdale. */
  currentLocation: GeoPoint
  /** Ground speed in km/h. */
  gpsSpeed: number
  /** Clockwise degrees from true north. */
  heading: number
  updateGps: (data: Partial<GpsFix>) => void
  /** Apply a hardware GNSS update and retire the mock route. */
  applyLiveGps: (fix: GpsUpdate) => void
  playback: PlaybackState
  togglePlayback: () => void
  /** Move one track. Positive skips forward. */
  skipTrack: (direction: -1 | 1) => void
  /** Restart the current track after a few seconds, otherwise skip back. */
  previousTrack: () => void
  seekPlayback: (seconds: number) => void
}

export interface PlaybackState {
  trackIndex: number
  /** Seconds into the current track. */
  position: number
  playing: boolean
}

const TELEMETRY_KEYS = ['rpm', 'speed', 'coolantTemp', 'fuelLevel', 'batteryVoltage'] as const

const DSP_SOURCES = ['coaxial', 'aux', 'bluetooth'] as const satisfies readonly DspSource[]

const zeroBands = (): EqBands => [0, 0, 0, 0, 0, 0, 0]

const MOCK_PERIOD_MS = 100
const DRIVE_CYCLE_SEC = 40

let mockTimer: ReturnType<typeof setInterval> | null = null
let torontoGpsTimer: ReturnType<typeof setInterval> | null = null
let obcRunTimer: ReturnType<typeof setInterval> | null = null
let playbackTimer: ReturnType<typeof setInterval> | null = null
let lastSynthAt = 0
const obcStartedAt = Date.now()

/** Dufferin Street at Wilson Avenue, the north end of the Yorkdale loop. */
const DEMO_GPS: GpsFix = {
  latitude: 43.732034,
  longitude: -79.458876,
  heading: 170,
  speed: 0,
}

export const useVehicleStore = create<VehicleState>((set, get) => ({
  rpm: 0,
  speed: 0,
  coolantTemp: 0,
  fuelLevel: 0,
  batteryVoltage: 12.6,
  masterVolume: 40,
  eqBands: zeroBands(),
  dspSource: 'coaxial',
  doorLocks: true,
  windows: { front: 'up', rear: 'up' },
  headlights: false,
  isMockMode: true,
  telemetry: {
    rpm: 0,
    speedKmh: 0,
    coolantC: 0,
    fuelPercent: 0,
    ibusConnected: false,
    canConnected: false,
    canSimulated: false,
    lastIbusFrame: null,
  },
  audio: {
    gains: zeroBands(),
    roomPreset: 'all',
    masterVolume: 40,
  },
  controls: {
    doorsLocked: true,
    frontWindowsUp: true,
    rearWindowsUp: true,
    interiorLight: false,
    parkingLights: false,
  },
  inpa: {
    open: false,
    mock: true,
  },
  obcData: initialObc(),
  units: 'metric',
  clockFormat: '24h',
  obcClockAt: Date.now(),
  obcFromCluster: false,
  gps: { ...DEMO_GPS },
  gpsLive: false,
  currentLocation: { latitude: DEMO_GPS.latitude, longitude: DEMO_GPS.longitude },
  gpsSpeed: DEMO_GPS.speed,
  heading: DEMO_GPS.heading,
  playback: { trackIndex: 0, position: 0, playing: true },
  updateTelemetry: (data) => {
    const patch = sanitizeTelemetry(data)
    set((state) => {
      if (sameTelemetry(state, patch)) return state
      return {
        ...patch,
        telemetry: mirrorTelemetry(state.telemetry, patch),
      }
    })
  },
  setMasterVolume: (volume) => {
    if (!Number.isFinite(volume)) return
    const masterVolume = clamp(Math.round(volume), 0, 100)
    set((state) => ({
      masterVolume,
      audio: { ...state.audio, masterVolume },
    }))
    window.headunit?.setMasterVolume(masterVolume)
  },
  setEqBand: (bandIndex, value) => {
    if (!Number.isFinite(value)) return
    const gain = clamp(Math.round(value), -12, 12)
    if (typeof bandIndex === 'number') {
      if (!isEqBandIndex(bandIndex)) return
      set((state) => ({ eqBands: replaceBand(state.eqBands, bandIndex, gain) }))
      return
    }
    const index = EQ_BANDS.findIndex((item) => item.id === bandIndex)
    if (!isEqBandIndex(index)) return
    set((state) => ({
      audio: { ...state.audio, gains: replaceBand(state.audio.gains, index, gain) },
    }))
    window.headunit?.setEqBand(bandIndex, gain)
  },
  toggleDoorLocks: () => {
    const doorLocks = !get().doorLocks
    set((state) => ({
      doorLocks,
      controls: { ...state.controls, doorsLocked: doorLocks },
    }))
    window.headunit?.sendCarControl(doorLocks ? 'lock-all' : 'unlock-all')
  },
  toggleMockMode: (enabled) => {
    set({ isMockMode: enabled })
    if (!enabled) {
      clearMockTimer()
      clearTorontoGps()
      return
    }
    if (window.headunit) startTorontoGps()
    else get().startMockStream()
  },
  startMockStream: () => {
    if (!get().isMockMode || mockTimer !== null) return
    const startedAt = Date.now()
    const fuelStart = get().fuelLevel > 0 ? get().fuelLevel : 62
    const tick = (): void => {
      if (!get().isMockMode) {
        clearMockTimer()
        return
      }
      const elapsedSec = (Date.now() - startedAt) / 1000
      get().updateTelemetry(sampleDrive(elapsedSec, fuelStart))
      const state = get()
      if (!state.obcFromCluster) {
        state.updateOBCData(synthesizeObc(state.obcData, state.speed, state.fuelLevel, MOCK_PERIOD_MS / 1000, elapsedSec))
      }
    }
    mockTimer = setInterval(tick, MOCK_PERIOD_MS)
    tick()
    startTorontoGps()
  },
  stopMockStream: () => {
    clearMockTimer()
    clearTorontoGps()
  },
  setDspSource: (source) => {
    if (!isDspSource(source)) return
    set({ dspSource: source })
  },
  setHeadlights: (on) => {
    set({ headlights: on })
  },
  setWindows: (windows) => {
    set((state) => {
      const next = mergeWindows(state.windows, windows)
      return {
        windows: next,
        controls: {
          ...state.controls,
          frontWindowsUp: next.front === 'up',
          rearWindowsUp: next.rear === 'up',
        },
      }
    })
  },
  setTelemetry: (telemetry) => {
    if (mockTimer !== null) {
      set((state) => ({
        telemetry: {
          ...telemetry,
          rpm: state.rpm,
          speedKmh: state.speed,
          coolantC: state.coolantTemp,
          fuelPercent: state.fuelLevel,
        },
      }))
      return
    }
    const current = get()
    const dt = synthDt()
    const elapsed = elapsedSeconds()
    set({
      telemetry,
      rpm: telemetry.rpm,
      speed: telemetry.speedKmh,
      coolantTemp: telemetry.coolantC,
      fuelLevel: telemetry.fuelPercent,
      obcData: current.obcFromCluster
        ? current.obcData
        : mergeObc(
            current.obcData,
            synthesizeObc(current.obcData, telemetry.speedKmh, telemetry.fuelPercent, dt, elapsed),
          ),
    })
  },
  setRoomPreset: (preset) => {
    set((state) => ({ audio: { ...state.audio, roomPreset: preset } }))
    window.headunit?.setRoomPreset(preset)
  },
  toggleInpa: () => set((state) => ({ inpa: { ...state.inpa, open: !state.inpa.open } })),
  setInpaMock: (mock) => set((state) => ({ inpa: { ...state.inpa, mock } })),
  applyControl: (action) => {
    set((state) => {
      const controls = nextControls(state.controls, action)
      return {
        controls,
        doorLocks: controls.doorsLocked,
        windows: {
          front: controls.frontWindowsUp ? 'up' : 'down',
          rear: controls.rearWindowsUp ? 'up' : 'down',
        },
      }
    })
    window.headunit?.sendCarControl(action)
  },
  updateOBCData: (data) => {
    const patch = sanitizeObc(data)
    set((state) => {
      if (sameObc(state.obcData, patch)) return state
      const obcData = mergeObc(state.obcData, patch)
      const anchored = patch.time !== undefined || patch.date !== undefined
      return anchored ? { obcData, obcClockAt: Date.now() } : { obcData }
    })
  },
  applyClusterObc: (update) => {
    const patch = sanitizeObc(update.data)
    set((state) => {
      const obcData = sameObc(state.obcData, patch) ? state.obcData : mergeObc(state.obcData, patch)
      const anchored = patch.time !== undefined || patch.date !== undefined
      return {
        obcData,
        obcFromCluster: state.obcFromCluster || Object.keys(patch).length > 0,
        units: update.units ?? state.units,
        clockFormat: update.clockFormat ?? state.clockFormat,
        ...(anchored ? { obcClockAt: Date.now() } : null),
      }
    })
    if (typeof update.data?.timerRunning === 'boolean' && update.data.timerRunning) startObcRunTimer()
  },
  setSpeedLimit: (limit) => {
    const state = get()
    if (!Number.isFinite(limit)) return
    const display = clamp(Math.round(limit), 1, speedLimitMax(state.units))
    const kmh = Math.round(fromDisplaySpeed(display, state.units))
    set((current) => ({ obcData: { ...current.obcData, limit: kmh, limitEnabled: true } }))
    window.headunit?.sendObc({ kind: 'set-limit', limit: display })
  },
  clearSpeedLimit: () => {
    set((state) => ({ obcData: { ...state.obcData, limitEnabled: false } }))
    window.headunit?.sendObc({ kind: 'limit', action: 'off' })
  },
  adoptSpeedLimit: () => {
    const state = get()
    const display = Math.round(toDisplaySpeed(state.speed, state.units))
    if (display < 1) return
    get().setSpeedLimit(display)
    window.headunit?.sendObc({ kind: 'limit', action: 'current' })
  },
  toggleUnits: () => {
    const units: UnitSystem = get().units === 'metric' ? 'imperial' : 'metric'
    set({ units })
    window.headunit?.sendObc({ kind: 'set-units', units })
  },
  setClockFormat: (format) => {
    if (format !== '24h' && format !== '12h') return
    set({ clockFormat: format })
    window.headunit?.sendObc({ kind: 'set-clock-format', format })
  },
  setObcClock: (input) => {
    const hour = clamp(Math.round(input.hour), 0, 23)
    const minute = clamp(Math.round(input.minute), 0, 59)
    const year = clamp(Math.round(input.year), 1993, 2092)
    const month = clamp(Math.round(input.month), 1, 12)
    const day = clamp(Math.round(input.day), 1, new Date(year, month, 0).getDate())
    const time = `${pad2(hour)}:${pad2(minute)}`
    const date = `${year.toString().padStart(4, '0')}-${pad2(month)}-${pad2(day)}`
    set({
      clockFormat: input.format,
      obcClockAt: Date.now(),
      obcData: { ...get().obcData, time, date },
    })
    window.headunit?.sendObc({ kind: 'set-clock-format', format: input.format })
    window.headunit?.sendObc({ kind: 'set-time', hour, minute, format: input.format })
    window.headunit?.sendObc({ kind: 'set-date', day, month, year })
  },
  setTimerRunning: (running) => {
    set((state) => ({
      obcData: {
        ...state.obcData,
        timerRunning: running,
        timer: running ? 0 : state.obcData.timer,
      },
    }))
    if (running) startObcRunTimer()
    window.headunit?.sendObc({ kind: 'timer', running })
  },
  updateGps: (data) => {
    const patch = sanitizeGps(data)
    if (Object.keys(patch).length === 0) return
    set((state) => {
      const gps = { ...state.gps, ...patch }
      return {
        gps,
        currentLocation: { latitude: gps.latitude, longitude: gps.longitude },
        gpsSpeed: gps.speed,
        heading: gps.heading,
      }
    })
  },
  applyLiveGps: (fix) => {
    const patch = sanitizeGps(fix)
    if (Object.keys(patch).length === 0) return
    clearTorontoGps()
    set((state) => {
      const gps = { ...state.gps, ...patch }
      return {
        gps,
        gpsLive: true,
        currentLocation: { latitude: gps.latitude, longitude: gps.longitude },
        gpsSpeed: gps.speed,
        heading: gps.heading,
      }
    })
  },
  togglePlayback: () => {
    set((state) => ({ playback: { ...state.playback, playing: !state.playback.playing } }))
  },
  skipTrack: (direction) => {
    set((state) => ({
      playback: {
        ...state.playback,
        trackIndex: wrapTrack(state.playback.trackIndex + direction),
        position: 0,
      },
    }))
  },
  previousTrack: () => {
    const { playback } = get()
    if (playback.position > 3) {
      set({ playback: { ...playback, position: 0 } })
      return
    }
    get().skipTrack(-1)
  },
  seekPlayback: (seconds) => {
    if (!Number.isFinite(seconds)) return
    set((state) => {
      const duration = trackAt(state.playback.trackIndex).duration
      return { playback: { ...state.playback, position: clamp(seconds, 0, duration) } }
    })
  },
  recalculateObc: (property) => {
    set((state) => {
      if (property === 'avgSpeed') {
        return { obcData: { ...state.obcData, avgSpeed: Math.round(state.speed) } }
      }
      const fresh = Math.round((8 + state.speed / 40) * 10) / 10
      return { obcData: { ...state.obcData, [property]: fresh } }
    })
    window.headunit?.sendObc({ kind: 'recalculate', property })
  },
}))

function sanitizeTelemetry(data: Partial<TelemetryState> | null | undefined): Partial<TelemetryState> {
  if (typeof data !== 'object' || data === null) return {}
  const patch: Partial<TelemetryState> = {}
  for (const key of TELEMETRY_KEYS) {
    const value = data[key]
    if (typeof value === 'number' && Number.isFinite(value)) patch[key] = value
  }
  return patch
}

function sameTelemetry(state: TelemetryState, patch: Partial<TelemetryState>): boolean {
  for (const key of TELEMETRY_KEYS) {
    if (patch[key] !== undefined && patch[key] !== state[key]) return false
  }
  return true
}

function mirrorTelemetry(telemetry: Telemetry, patch: Partial<TelemetryState>): Telemetry {
  return {
    ...telemetry,
    ...(patch.rpm !== undefined ? { rpm: patch.rpm } : null),
    ...(patch.speed !== undefined ? { speedKmh: patch.speed } : null),
    ...(patch.coolantTemp !== undefined ? { coolantC: patch.coolantTemp } : null),
    ...(patch.fuelLevel !== undefined ? { fuelPercent: patch.fuelLevel } : null),
  }
}

function replaceBand(bands: EqBands, index: EqBandIndex, gain: number): EqBands {
  const next: EqBands = [bands[0], bands[1], bands[2], bands[3], bands[4], bands[5], bands[6]]
  next[index] = gain
  return next
}

function mergeWindows(current: WindowsState, patch: Partial<WindowsState>): WindowsState {
  return {
    front: isWindowPosition(patch.front) ? patch.front : current.front,
    rear: isWindowPosition(patch.rear) ? patch.rear : current.rear,
  }
}

function nextControls(controls: VehicleControls, action: CarAction): VehicleControls {
  switch (action) {
    case 'lock-all':
      return { ...controls, doorsLocked: true }
    case 'unlock-all':
      return { ...controls, doorsLocked: false }
    case 'front-windows-up':
      return { ...controls, frontWindowsUp: true }
    case 'front-windows-down':
      return { ...controls, frontWindowsUp: false }
    case 'rear-windows-up':
      return { ...controls, rearWindowsUp: true }
    case 'rear-windows-down':
      return { ...controls, rearWindowsUp: false }
    case 'interior-light-on':
      return { ...controls, interiorLight: true }
    case 'interior-light-off':
      return { ...controls, interiorLight: false }
    case 'parking-lights-on':
      return { ...controls, parkingLights: true }
    case 'parking-lights-off':
      return { ...controls, parkingLights: false }
  }
}

function sampleDrive(elapsedSec: number, fuelStart: number): TelemetryState {
  const cycle = elapsedSec % DRIVE_CYCLE_SEC
  const idle = 740 + Math.sin(elapsedSec * 8.5) * 18 + Math.sin(elapsedSec * 2.2) * 8
  let speed = 0
  let rpm = idle

  if (cycle < 5) {
    speed = 0
    rpm = idle
  } else if (cycle < 14) {
    const t = (cycle - 5) / 9
    speed = smoothstep(t) * 80
    rpm = revInGear(t, elapsedSec)
  } else if (cycle < 26) {
    const t = (cycle - 14) / 12
    speed = 80 + Math.sin(t * Math.PI * 2) * 4
    rpm = 2050 + Math.sin(elapsedSec * 0.7) * 80
  } else if (cycle < 33) {
    const t = (cycle - 26) / 7
    speed = 80 + smoothstep(t) * 55
    rpm = 2300 + smoothstep(t) * 2700 + Math.sin(elapsedSec * 5) * 35
  } else {
    const t = (cycle - 33) / 7
    speed = 135 * (1 - smoothstep(t))
    const coastRpm = 900 + speed * 14
    rpm = speed < 8 ? idle + (coastRpm - idle) * (speed / 8) : coastRpm
  }

  const load = Math.max(0, (rpm - 2000) / 4000)
  const coolantTemp = 97 - 45 * Math.exp(-elapsedSec / 40) + load * 3 + Math.sin(elapsedSec * 0.35) * 0.6
  const fuelLevel = Math.max(5, fuelStart - elapsedSec * 0.02)
  const batteryVoltage = 14.05 + Math.sin(elapsedSec * 2.4) * 0.05

  return {
    rpm: Math.round(clamp(rpm, 600, 6800)),
    speed: Math.round(clamp(speed, 0, 260)),
    coolantTemp: Math.round(clamp(coolantTemp, 10, 120) * 10) / 10,
    fuelLevel: Math.round(clamp(fuelLevel, 0, 100) * 10) / 10,
    batteryVoltage: Math.round(batteryVoltage * 100) / 100,
  }
}

function revInGear(progress: number, elapsedSec: number): number {
  const segments = [
    { start: 0, end: 0.38, rpm0: 1100, rpm1: 4300 },
    { start: 0.38, end: 0.7, rpm0: 2100, rpm1: 4000 },
    { start: 0.7, end: 1, rpm0: 1900, rpm1: 2800 },
  ]
  const segment = segments.find((item) => progress <= item.end) ?? segments[2]
  const local = (progress - segment.start) / (segment.end - segment.start)
  return segment.rpm0 + smoothstep(local) * (segment.rpm1 - segment.rpm0) + Math.sin(elapsedSec * 6) * 25
}

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

function clearMockTimer(): void {
  if (mockTimer === null) return
  clearInterval(mockTimer)
  mockTimer = null
}

function isEqBandIndex(value: number): value is EqBandIndex {
  return Number.isInteger(value) && value >= 0 && value <= 6
}

function isDspSource(value: unknown): value is DspSource {
  return typeof value === 'string' && DSP_SOURCES.some((source) => source === value)
}

function isWindowPosition(value: unknown): value is WindowPosition {
  return value === 'up' || value === 'down'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function pad2(value: number): string {
  return Math.trunc(value).toString().padStart(2, '0')
}

function initialObc(): ObcData {
  const now = new Date()
  return {
    range: 420,
    outTemp: 8,
    consumption1: 10.4,
    consumption2: 9.1,
    avgSpeed: 0,
    limit: 120,
    limitEnabled: false,
    distance: 0,
    timer: 0,
    timerRunning: false,
    time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    date: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
  }
}

const OBC_NUMBERS = ['range', 'outTemp', 'consumption1', 'consumption2', 'avgSpeed', 'limit', 'distance', 'timer'] as const

function sanitizeObc(data: Partial<ObcData> | undefined): Partial<ObcData> {
  if (!data) return {}
  const patch: Partial<ObcData> = {}
  for (const key of OBC_NUMBERS) {
    const value = data[key]
    if (typeof value === 'number' && Number.isFinite(value)) patch[key] = value
  }
  if (typeof data.limitEnabled === 'boolean') patch.limitEnabled = data.limitEnabled
  if (typeof data.timerRunning === 'boolean') patch.timerRunning = data.timerRunning
  if (typeof data.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)) patch.time = data.time
  if (typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) patch.date = data.date
  return patch
}

function sameObc(current: ObcData, patch: Partial<ObcData>): boolean {
  for (const key of Object.keys(patch) as (keyof ObcData)[]) {
    if (patch[key] !== current[key]) return false
  }
  return true
}

function mergeObc(current: ObcData, patch: Partial<ObcData>): ObcData {
  return { ...current, ...patch }
}

function synthesizeObc(
  current: ObcData,
  speedKmh: number,
  fuelPercent: number,
  dtSec: number,
  elapsedSec: number,
): Partial<ObcData> {
  const avg = current.avgSpeed === 0 ? speedKmh : current.avgSpeed * 0.985 + speedKmh * 0.015
  return {
    range: Math.max(0, Math.round(fuelPercent * 6.4)),
    outTemp: Math.round((8 + Math.sin(elapsedSec / 25) * 3) * 10) / 10,
    consumption1: Math.round((9.2 + (speedKmh / 120) * 4 + Math.sin(elapsedSec / 7) * 0.4) * 10) / 10,
    consumption2: Math.round((8.4 + Math.sin(elapsedSec / 18) * 0.5) * 10) / 10,
    avgSpeed: Math.round(avg * 10) / 10,
    distance: current.distance + (speedKmh * dtSec) / 3600,
  }
}

function synthDt(): number {
  const now = Date.now()
  if (lastSynthAt === 0) {
    lastSynthAt = now
    return 0.5
  }
  const dt = Math.min(2, (now - lastSynthAt) / 1000)
  lastSynthAt = now
  return dt
}

function elapsedSeconds(): number {
  return (Date.now() - obcStartedAt) / 1000
}

function sanitizeGps(data: Partial<GpsFix> | undefined): Partial<GpsFix> {
  if (!data) return {}
  const patch: Partial<GpsFix> = {}
  if (typeof data.latitude === 'number' && data.latitude >= -90 && data.latitude <= 90) {
    patch.latitude = data.latitude
  }
  if (typeof data.longitude === 'number' && data.longitude >= -180 && data.longitude <= 180) {
    patch.longitude = data.longitude
  }
  if (typeof data.heading === 'number' && Number.isFinite(data.heading)) {
    patch.heading = ((data.heading % 360) + 360) % 360
  }
  if (typeof data.speed === 'number' && Number.isFinite(data.speed)) {
    patch.speed = clamp(data.speed, 0, 400)
  }
  return patch
}

/**
 * South on Dufferin from Wilson Avenue, past Yorkdale Mall and the 401, to Lawrence Avenue, then back north.
 * Speeds are typical for that arterial, slower beside the mall.
 */
const DUFFERIN_NEAR_YORKDALE: readonly RouteVertex[] = [
  { latitude: 43.732034, longitude: -79.458876, speedKmh: 48 },
  { latitude: 43.7294, longitude: -79.45805, speedKmh: 50 },
  { latitude: 43.7271, longitude: -79.45755, speedKmh: 34 },
  { latitude: 43.7256, longitude: -79.4572, speedKmh: 28 },
  { latitude: 43.7228, longitude: -79.45635, speedKmh: 42 },
  { latitude: 43.7186, longitude: -79.45535, speedKmh: 50 },
  { latitude: 43.71409, longitude: -79.45475, speedKmh: 36 },
  { latitude: 43.7186, longitude: -79.4553, speedKmh: 48 },
  { latitude: 43.7228, longitude: -79.4563, speedKmh: 44 },
  { latitude: 43.7256, longitude: -79.45715, speedKmh: 28 },
  { latitude: 43.7271, longitude: -79.4575, speedKmh: 36 },
  { latitude: 43.7294, longitude: -79.458, speedKmh: 50 },
  { latitude: 43.732034, longitude: -79.458876, speedKmh: 48 },
]

const torontoRoute = measureRoute(DUFFERIN_NEAR_YORKDALE)

/** [longitude, latitude] pairs for the offline map's Dufferin Street line. */
export function dufferinRouteCoordinates(): [number, number][] {
  return DUFFERIN_NEAR_YORKDALE.map((vertex) => [vertex.longitude, vertex.latitude])
}
let torontoCursorM = 0

function startTorontoGps(): void {
  const state = useVehicleStore.getState()
  if (torontoGpsTimer !== null || !state.isMockMode || state.gpsLive) return
  const publish = () => {
    const current = useVehicleStore.getState()
    if (!current.isMockMode || current.gpsLive) {
      clearTorontoGps()
      return
    }
    const fix = sampleTorontoRoute(torontoCursorM)
    torontoCursorM = (torontoCursorM + (fix.speed * 1000) / 3600) % torontoRoute.totalM
    useVehicleStore.getState().updateGps(sampleTorontoRoute(torontoCursorM))
  }
  publish()
  torontoGpsTimer = setInterval(publish, 1000)
}

function clearTorontoGps(): void {
  if (torontoGpsTimer === null) return
  clearInterval(torontoGpsTimer)
  torontoGpsTimer = null
}

interface RouteVertex {
  latitude: number
  longitude: number
  speedKmh: number
}

interface MeasuredRoute {
  vertices: readonly RouteVertex[]
  cumulativeM: number[]
  totalM: number
}

function measureRoute(vertices: readonly RouteVertex[]): MeasuredRoute {
  const cumulativeM = [0]
  for (let index = 1; index < vertices.length; index += 1) {
    const previous = cumulativeM[index - 1] ?? 0
    cumulativeM.push(previous + distanceMeters(vertices[index - 1], vertices[index]))
  }
  return { vertices, cumulativeM, totalM: cumulativeM[cumulativeM.length - 1] ?? 0 }
}

function sampleTorontoRoute(distanceM: number): GpsFix {
  const { vertices, cumulativeM, totalM } = torontoRoute
  const distance = totalM > 0 ? ((distanceM % totalM) + totalM) % totalM : 0
  let index = 0
  while (index < vertices.length - 2 && (cumulativeM[index + 1] ?? 0) < distance) index += 1
  const start = vertices[index]
  const end = vertices[index + 1] ?? start
  const segmentM = (cumulativeM[index + 1] ?? 0) - (cumulativeM[index] ?? 0)
  const progress = segmentM <= 0 ? 0 : (distance - (cumulativeM[index] ?? 0)) / segmentM
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * progress,
    longitude: start.longitude + (end.longitude - start.longitude) * progress,
    heading: bearingDegrees(start, end),
    speed: start.speedKmh + (end.speedKmh - start.speedKmh) * progress,
  }
}

function distanceMeters(start: RouteVertex, end: RouteVertex): number {
  const lat = ((end.latitude - start.latitude) * Math.PI) / 180
  const lng = ((end.longitude - start.longitude) * Math.PI) / 180
  const lat1 = (start.latitude * Math.PI) / 180
  const lat2 = (end.latitude * Math.PI) / 180
  const a = Math.sin(lat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearingDegrees(start: RouteVertex, end: RouteVertex): number {
  const lat1 = (start.latitude * Math.PI) / 180
  const lat2 = (end.latitude * Math.PI) / 180
  const lng = ((end.longitude - start.longitude) * Math.PI) / 180
  const y = Math.sin(lng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function startObcRunTimer(): void {
  if (obcRunTimer !== null) return
  let last = Date.now()
  obcRunTimer = setInterval(() => {
    const now = Date.now()
    const dt = (now - last) / 1000
    last = now
    useVehicleStore.setState((current) => {
      if (!current.obcData.timerRunning || current.obcFromCluster) return current
      return { obcData: { ...current.obcData, timer: current.obcData.timer + dt } }
    })
  }, 250)
}

function clearObcRunTimer(): void {
  if (obcRunTimer === null) return
  clearInterval(obcRunTimer)
  obcRunTimer = null
}

function startPlaybackTimer(): void {
  if (playbackTimer !== null) return
  playbackTimer = setInterval(() => {
    useVehicleStore.setState((state) => {
      if (!state.playback.playing) return state
      const duration = trackAt(state.playback.trackIndex).duration
      const position = state.playback.position + 0.25
      if (position < duration) return { playback: { ...state.playback, position } }
      return {
        playback: {
          ...state.playback,
          trackIndex: wrapTrack(state.playback.trackIndex + 1),
          position: 0,
        },
      }
    })
  }, 250)
}

function clearPlaybackTimer(): void {
  if (playbackTimer === null) return
  clearInterval(playbackTimer)
  playbackTimer = null
}

function wrapTrack(index: number): number {
  return ((index % TRACKS.length) + TRACKS.length) % TRACKS.length
}

if (typeof window !== 'undefined') {
  queueMicrotask(() => {
    const state = useVehicleStore.getState()
    startPlaybackTimer()
    if (!state.isMockMode) return
    if (window.headunit) startTorontoGps()
    else state.startMockStream()
  })
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    clearMockTimer()
    clearTorontoGps()
    clearObcRunTimer()
    clearPlaybackTimer()
  })
}
