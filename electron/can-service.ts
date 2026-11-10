/**
 * BMW E53 PT-CAN telemetry.
 * The interval is a stand-in until a SocketCAN or ELM adapter is connected.
 * Frame IDs and scales are this headunit's decoder contract — confirm them on the vehicle.
 */

export interface CanFrame {
  id: number
  data: Uint8Array
}

/** Plug-in point for a SocketCAN or ELM adapter. Call the listener with each received frame. */
export interface CanAdapter {
  addFrameListener(listener: (frame: CanFrame) => void): void
}

export interface CanTelemetry {
  rpm: number
  speedKmh: number
  coolantC: number
  fuelPercent: number
  canConnected: boolean
  canSimulated: boolean
}

export interface CanSignals {
  rpm?: number
  speedKmh?: number
  coolantC?: number
  fuelPercent?: number
}

export const PTCAN_FRAME = {
  rpmSpeed: 0x316,
  coolant: 0x329,
  fuel: 0x545,
} as const

export interface CanService {
  stop: () => void
  ingest: (frame: CanFrame) => void
}

export function startCanService(
  onTelemetry: (update: CanTelemetry) => void,
  adapter?: CanAdapter,
): CanService {
  let stopped = false
  let hardware = adapter !== undefined
  let timer: ReturnType<typeof setInterval> | null = null
  const signals = { rpm: 0, speedKmh: 0, coolantC: 0, fuelPercent: 0 }

  const stopSimulation = (): void => {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  const publish = (canConnected: boolean, canSimulated: boolean): void => {
    onTelemetry({
      rpm: signals.rpm,
      speedKmh: signals.speedKmh,
      coolantC: signals.coolantC,
      fuelPercent: signals.fuelPercent,
      canConnected,
      canSimulated,
    })
  }

  const ingest = (frame: CanFrame): void => {
    if (stopped) return
    if (!hardware) {
      hardware = true
      stopSimulation()
      console.info('[can] adapter frame received; stopping simulated ticks')
    }
    const decoded = decodeCanFrame(frame)
    if (!decoded) return
    if (decoded.rpm !== undefined) signals.rpm = decoded.rpm
    if (decoded.speedKmh !== undefined) signals.speedKmh = decoded.speedKmh
    if (decoded.coolantC !== undefined) signals.coolantC = decoded.coolantC
    if (decoded.fuelPercent !== undefined) signals.fuelPercent = decoded.fuelPercent
    publish(true, false)
  }

  if (adapter) {
    adapter.addFrameListener(ingest)
    console.info('[can] adapter attached')
  } else {
    console.info('[can] no adapter attached; emitting simulated PT-CAN ticks')
    let tick = 0
    const emitSimulated = (): void => {
      if (stopped || hardware) return
      tick += 1
      signals.rpm = Math.round(900 + 2200 * (0.5 + 0.5 * Math.sin(tick / 7)))
      signals.speedKmh = Math.round(20 + 70 * (0.5 + 0.5 * Math.sin(tick / 11)))
      signals.coolantC = 88 + Math.round(5 * Math.sin(tick / 18))
      signals.fuelPercent = Math.max(12, Math.round(74 - (tick % 280) / 6))
      publish(false, true)
    }
    emitSimulated()
    timer = setInterval(emitSimulated, 500)
  }

  return {
    ingest,
    stop() {
      stopped = true
      stopSimulation()
    },
  }
}

export function decodeCanFrame(frame: CanFrame): CanSignals | null {
  switch (frame.id) {
    case PTCAN_FRAME.rpmSpeed: {
      const rpmWord = (byte(frame.data, 3) << 8) | byte(frame.data, 2)
      return {
        rpm: clamp(Math.round(rpmWord / 4), 0, 8000),
        speedKmh: clamp(byte(frame.data, 0), 0, 320),
      }
    }
    case PTCAN_FRAME.coolant:
      return { coolantC: clamp(Math.round(byte(frame.data, 1) * 0.75 - 48), -40, 150) }
    case PTCAN_FRAME.fuel:
      return { fuelPercent: clamp(Math.round((byte(frame.data, 0) / 255) * 100), 0, 100) }
    default:
      return null
  }
}

function byte(data: Uint8Array, index: number): number {
  return data[index] ?? 0
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
