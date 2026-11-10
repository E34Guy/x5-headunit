/**
 * USB GPS receiver → NMEA → live fix for the MapLibre marker.
 *
 * Opens a serial GPS automatically (or GPS_PORT when set), reads NMEA lines,
 * and publishes latitude, longitude, speed (km/h), and heading.
 * Typical consumer GPS modules speak at 4800 or 9600 baud; some u-blox units use 115200.
 */

import type { GpsUpdate } from '../src/protocol.js'

export type { GpsUpdate }

export interface GpsServiceHandlers {
  onFix: (fix: GpsUpdate) => void
  onConnection: (connected: boolean, path: string | null) => void
}

export interface GpsService {
  start: () => Promise<void>
  stop: () => void
}

const BAUD_CANDIDATES = [9600, 4800, 115200] as const
const PROBE_MS = 2500
const RESCAN_MS = 5000
const MIN_NMEA_HITS = 2
const PUBLISH_MIN_MS = 200

const GPS_HINT =
  /gps|gnss|u-blox|ublox|global.?sat|silicon.?labs|cp210|ch340|prolific|ftdi|usb.?serial|usbserial|usbmodem/i

type SerialPortCtor = typeof import('serialport').SerialPort
type SerialPortInstance = InstanceType<SerialPortCtor>
type PortInfo = Awaited<ReturnType<SerialPortCtor['list']>>[number]

interface OpenPort {
  port: SerialPortInstance
  path: string
  baudRate: number
}

export function startGpsService(handlers: GpsServiceHandlers): GpsService {
  let stopped = false
  let starting = false
  let open: OpenPort | null = null
  let rescanTimer: ReturnType<typeof setTimeout> | null = null
  let SerialPort: SerialPortCtor | null = null
  let ReadlineParser: typeof import('serialport').ReadlineParser | null = null

  const clearRescan = (): void => {
    if (rescanTimer === null) return
    clearTimeout(rescanTimer)
    rescanTimer = null
  }

  const scheduleRescan = (): void => {
    clearRescan()
    if (stopped) return
    rescanTimer = setTimeout(() => {
      rescanTimer = null
      void connect()
    }, RESCAN_MS)
  }

  const setConnected = (connected: boolean, path: string | null): void => {
    handlers.onConnection(connected, path)
  }

  const closeQuietly = (port: SerialPortInstance): Promise<void> =>
    new Promise((resolve) => {
      port.removeAllListeners()
      if (!port.isOpen) {
        resolve()
        return
      }
      port.close(() => resolve())
    })

  const loadSerial = async (): Promise<boolean> => {
    if (SerialPort && ReadlineParser) return true
    try {
      const mod = await import('serialport')
      SerialPort = mod.SerialPort
      ReadlineParser = mod.ReadlineParser
      return true
    } catch (error) {
      console.error('[gps] serialport unavailable', error instanceof Error ? error.message : error)
      return false
    }
  }

  /** Open path@baud, wait for NMEA, then keep the port and stream fixes. */
  const tryOpen = async (path: string, baudRate: number): Promise<OpenPort | null> => {
    if (!SerialPort || !ReadlineParser) return null

    const port = new SerialPort({
      path,
      baudRate,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: false,
    })

    const opened = await new Promise<boolean>((resolve) => {
      port.open((error) => resolve(!error))
    })
    if (!opened) {
      await closeQuietly(port)
      return null
    }

    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }))
    let nmeaHits = 0
    let accepted = false
    let lastPublishAt = 0

    const acceptedPort = await new Promise<OpenPort | null>((resolve) => {
      const timer = setTimeout(() => {
        if (accepted) return
        parser.removeAllListeners('data')
        void closeQuietly(port).then(() => resolve(null))
      }, PROBE_MS)

      parser.on('data', (raw: string) => {
        if (stopped) return

        if (!accepted) {
          if (!looksLikeNmea(raw)) return
          nmeaHits += 1
          if (nmeaHits < MIN_NMEA_HITS) return
          accepted = true
          clearTimeout(timer)
          resolve({ port, path, baudRate })
        }

        const fix = parseNmeaSentence(raw)
        if (!fix) return
        const now = Date.now()
        if (now - lastPublishAt < PUBLISH_MIN_MS) return
        lastPublishAt = now
        handlers.onFix(fix)
      })
    })

    return acceptedPort
  }

  const connect = async (): Promise<void> => {
    if (stopped || starting || open) return
    starting = true
    try {
      if (!(await loadSerial()) || !SerialPort) {
        scheduleRescan()
        return
      }

      const candidates = await listGpsCandidates(SerialPort)
      if (candidates.length === 0) {
        console.info('[gps] no GPS serial candidates; rescanning')
        scheduleRescan()
        return
      }

      for (const path of candidates) {
        if (stopped) return
        for (const baudRate of BAUD_CANDIDATES) {
          if (stopped) return
          console.info(`[gps] probing ${path} @ ${baudRate}`)
          const found = await tryOpen(path, baudRate)
          if (!found) continue

          open = found
          found.port.on('close', () => {
            if (open?.port !== found.port) return
            open = null
            setConnected(false, null)
            console.info(`[gps] closed ${found.path}`)
            scheduleRescan()
          })
          found.port.on('error', (error: Error) => {
            console.error('[gps] serial error', error.message)
            const current = open
            open = null
            if (current) void closeQuietly(current.port)
            setConnected(false, null)
            scheduleRescan()
          })
          setConnected(true, found.path)
          console.info(`[gps] open ${found.path} ${found.baudRate} 8N1`)
          return
        }
      }

      console.info('[gps] no NMEA stream found; rescanning')
      scheduleRescan()
    } finally {
      starting = false
    }
  }

  return {
    async start() {
      stopped = false
      await connect()
    },
    stop() {
      stopped = true
      clearRescan()
      const current = open
      open = null
      if (current) void closeQuietly(current.port)
      setConnected(false, null)
    },
  }
}

async function listGpsCandidates(SerialPort: SerialPortCtor): Promise<string[]> {
  const configured = process.env.GPS_PORT?.trim()
  const ibusPath = process.env.IBUS_PORT?.trim() || 'COM3'
  if (configured) return configured === ibusPath ? [] : [configured]

  let ports: PortInfo[] = []
  try {
    ports = await SerialPort.list()
  } catch (error) {
    console.error('[gps] SerialPort.list failed', error instanceof Error ? error.message : error)
    return []
  }

  return ports
    .map((port) => ({ path: port.path, score: scorePort(port, ibusPath) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.path)
}

function scorePort(port: PortInfo, ibusPath: string): number {
  const path = port.path
  if (!path || path === ibusPath) return 0
  // On macOS prefer /dev/cu.*; /dev/tty.* is the same hardware.
  if (process.platform === 'darwin' && /\/tty\./i.test(path)) return 0

  const haystack = [path, port.manufacturer, port.friendlyName, port.vendorId, port.productId]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')

  let score = 0
  if (GPS_HINT.test(haystack)) score += 5
  if (/usb|serial|modem/i.test(haystack)) score += 2
  if (/^COM\d+$/i.test(path)) score += 1
  if (/\/cu\.(usb|wch|slam|serial)/i.test(path)) score += 4
  if (port.vendorId) score += 1
  return score
}

function looksLikeNmea(raw: string): boolean {
  const line = raw.trim()
  return line.startsWith('$') && /^\$[A-Za-z]{5},/.test(line)
}

/** Parse RMC / GGA into a fix. Returns null until latitude and longitude are known. */
export function parseNmeaSentence(raw: string): GpsUpdate | null {
  const line = raw.trim()
  if (!line.startsWith('$')) return null
  const body = stripChecksum(line)
  if (!body) return null
  const parts = body.split(',')
  const type = (parts[0] ?? '').slice(-3).toUpperCase()
  if (type === 'RMC') return parseRmc(parts)
  if (type === 'GGA') return parseGga(parts)
  return null
}

function stripChecksum(line: string): string | null {
  const star = line.indexOf('*')
  const payload = star >= 0 ? line.slice(1, star) : line.slice(1)
  if (star < 0) return payload
  const expected = line.slice(star + 1, star + 3)
  if (!/^[0-9A-Fa-f]{2}$/.test(expected)) return payload
  let xor = 0
  for (let i = 0; i < payload.length; i += 1) xor ^= payload.charCodeAt(i)
  if (xor !== Number.parseInt(expected, 16)) return null
  return payload
}

function parseRmc(parts: string[]): GpsUpdate | null {
  // $--RMC,time,status,lat,N/S,lon,E/W,speedKnots,trackTrue,date,...
  const status = parts[2]
  if (status && status !== 'A' && status !== 'a') return null
  const latitude = nmeaToDegrees(parts[3], parts[4])
  const longitude = nmeaToDegrees(parts[5], parts[6])
  if (latitude === null || longitude === null) return null
  const knots = Number.parseFloat(parts[7] ?? '')
  const track = Number.parseFloat(parts[8] ?? '')
  const fix: GpsUpdate = { latitude, longitude }
  if (Number.isFinite(knots)) fix.speed = knots * 1.852
  if (Number.isFinite(track)) fix.heading = ((track % 360) + 360) % 360
  return fix
}

function parseGga(parts: string[]): GpsUpdate | null {
  // $--GGA,time,lat,N/S,lon,E/W,quality,... — position only; store keeps prior speed/heading.
  const quality = Number.parseInt(parts[6] ?? '0', 10)
  if (!Number.isFinite(quality) || quality < 1) return null
  const latitude = nmeaToDegrees(parts[2], parts[3])
  const longitude = nmeaToDegrees(parts[4], parts[5])
  if (latitude === null || longitude === null) return null
  return { latitude, longitude }
}

/** `ddmm.mmmm` / `dddmm.mmmm` plus hemisphere → signed decimal degrees. */
export function nmeaToDegrees(raw: string | undefined, hemi: string | undefined): number | null {
  if (!raw || !hemi) return null
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return null
  const absolute = Math.abs(value)
  const degrees = Math.floor(absolute / 100)
  const minutes = absolute - degrees * 100
  let decimal = degrees + minutes / 60
  const h = hemi.toUpperCase()
  if (h === 'S' || h === 'W') decimal = -decimal
  else if (h !== 'N' && h !== 'E') return null
  if (decimal < -180 || decimal > 180) return null
  return decimal
}
