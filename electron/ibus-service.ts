import { Buffer } from 'node:buffer'

import type { ClockFormat, ObcData, UnitSystem } from '../src/protocol.js'
import {
  consumptionToLitresPer100,
  fromDisplayDistance,
  fromDisplaySpeed,
  fromDisplayTemp,
  type ConsumptionUnit,
} from '../src/obc/units.js'

/**
 * Resler I-Bus adapter client.
 * The line is 9600 baud, 8 data bits, even parity, 1 stop bit (8E1).
 * IBUS_PORT selects the serial device. COM3 is a placeholder until the adapter is attached.
 */

export interface IbusFrame {
  source: number
  length: number
  destination: number
  data: number[]
  checksum: number
}

export interface IbusServiceHandlers {
  onFrame: (frame: IbusFrame) => void
  onConnection: (connected: boolean) => void
}

const MIN_LENGTH = 2
const MAX_LENGTH = 36

export function xorChecksum(bytes: readonly number[]): number {
  let value = 0
  for (const byte of bytes) value ^= byte
  return value & 0xff
}

export class IbusParser {
  private readonly buffer: number[] = []

  push(chunk: Uint8Array): IbusFrame[] {
    for (const byte of chunk) this.buffer.push(byte)
    const frames: IbusFrame[] = []

    while (this.buffer.length >= 4) {
      const length = this.buffer[1] ?? 0
      if (length < MIN_LENGTH || length > MAX_LENGTH) {
        this.buffer.shift()
        continue
      }

      const total = length + 2
      if (this.buffer.length < total) break

      const raw = this.buffer.slice(0, total)
      const checksum = raw[raw.length - 1] ?? 0
      if (checksum !== xorChecksum(raw.slice(0, -1))) {
        this.buffer.shift()
        continue
      }

      this.buffer.splice(0, total)
      frames.push({
        source: raw[0] ?? 0,
        length,
        destination: raw[2] ?? 0,
        data: raw.slice(3, -1),
        checksum,
      })
    }

    if (this.buffer.length > 256) {
      this.buffer.splice(0, this.buffer.length - 32)
    }

    return frames
  }
}

export function encodeIbusFrame(input: string | readonly number[]): Buffer {
  const bytes = typeof input === 'string' ? parseHex(input) : [...input]
  if (bytes.length < 3) {
    throw new Error('I-Bus frame is too short')
  }
  for (const byte of bytes) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new Error('I-Bus frame has a byte outside 0..255')
    }
  }
  // Length counts destination, payload, and the checksum appended below.
  const length = bytes.length - 1
  if (length > 255) throw new Error('I-Bus frame is too long')
  bytes[1] = length
  return Buffer.from([...bytes, xorChecksum(bytes)])
}

export function formatIbusFrame(frame: IbusFrame): string {
  const bytes = [frame.source, frame.length, frame.destination, ...frame.data, frame.checksum]
  return bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}

export class IbusService {
  readonly portPath: string
  private port: IbusPort | null = null
  private connected = false
  private starting = false
  private readonly parser = new IbusParser()

  constructor(private readonly handlers: IbusServiceHandlers) {
    const configured = process.env.IBUS_PORT
    this.portPath = configured && configured.length > 0 ? configured : 'COM3'
  }

  async start(): Promise<void> {
    if (this.port || this.starting) return
    this.starting = true

    try {
      const { SerialPort } = await import('serialport')
      const port = new SerialPort({
        path: this.portPath,
        baudRate: 9600,
        dataBits: 8,
        parity: 'even',
        stopBits: 1,
        autoOpen: false,
      })
      this.port = port
      port.on('data', (chunk: Buffer) => {
        for (const frame of this.parser.push(chunk)) {
          this.handlers.onFrame(frame)
        }
      })
      port.on('close', () => {
        this.setConnected(false)
      })
      port.on('error', (error: Error) => {
        console.error('[ibus] serial error; staying disconnected', error.message)
        this.setConnected(false)
      })
      port.open((error) => {
        if (error) {
          this.failOpen(error)
          return
        }
        this.setConnected(true)
        console.info(`[ibus] open ${this.portPath} 9600 8E1`)
      })
    } catch (error) {
      this.failOpen(error)
    } finally {
      this.starting = false
    }
  }

  transmit(frame: string | readonly number[]): void {
    const port = this.port
    if (!port || !this.connected) {
      console.info('[ibus] transmit dropped; port is not open')
      return
    }

    let payload: Buffer
    try {
      payload = encodeIbusFrame(frame)
    } catch (error) {
      console.error('[ibus] frame rejected', error instanceof Error ? error.message : error)
      return
    }

    port.write(payload, (error) => {
      if (error) console.error('[ibus] write failed', error.message)
    })
  }

  stop(): void {
    const port = this.port
    this.port = null
    this.setConnected(false)
    if (port?.isOpen) port.close()
  }

  private failOpen(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[ibus] could not open ${this.portPath}; staying disconnected`, message)
    this.setConnected(false)
  }

  private setConnected(connected: boolean): void {
    if (this.connected === connected) return
    this.connected = connected
    this.handlers.onConnection(connected)
  }
}

interface IbusPort {
  isOpen: boolean
  on(event: 'data', listener: (chunk: Buffer) => void): void
  on(event: 'close', listener: () => void): void
  on(event: 'error', listener: (error: Error) => void): void
  open(callback: (error: Error | null) => void): void
  write(data: Buffer, callback: (error: Error | null | undefined) => void): void
  close(): void
}

/**
 * Published E39/E53 high-cluster (IKE) on-board computer commands.
 * GT `0x3B` writes the cluster `0x80`. `encodeIbusFrame` fills the length and XOR checksum.
 * Region writes (`0x15`) only change unit and clock bits on a word the cluster has already sent.
 */
const GT = 0x3b
const IKE = 0x80

const ObcId = {
  time: 0x01,
  date: 0x02,
  outTemp: 0x03,
  consumption1: 0x04,
  consumption2: 0x05,
  range: 0x06,
  distance: 0x07,
  limit: 0x09,
  avgSpeed: 0x0a,
  timer: 0x0e,
} as const

const ObcCtl = {
  requestText: 0x01,
  requestStatus: 0x02,
  activate: 0x04,
  deactivate: 0x08,
  recalculate: 0x10,
  currentSpeed: 0x20,
} as const

const TEXT_POLL = [
  ObcId.time,
  ObcId.date,
  ObcId.outTemp,
  ObcId.consumption1,
  ObcId.consumption2,
  ObcId.range,
  ObcId.distance,
  ObcId.limit,
  ObcId.avgSpeed,
  ObcId.timer,
] as const

export type RegionWord = [number, number, number, number]

export interface ObcBusUpdate {
  data?: Partial<ObcData>
  units?: UnitSystem
  clockFormat?: ClockFormat
  region?: RegionWord
}

export function obcPollFrames(): number[][] {
  return [
    gtToIke([0x14]),
    ...TEXT_POLL.map((id) => gtToIke([0x41, id, ObcCtl.requestText])),
    gtToIke([0x41, ObcId.limit, ObcCtl.requestStatus]),
    gtToIke([0x41, ObcId.timer, ObcCtl.requestStatus]),
  ]
}

export function obcSetTimeFrame(hour: number, minute: number, format: ClockFormat): number[] {
  return gtToIke([0x40, ObcId.time, encodeHour(hour, format), minute])
}

export function obcSetDateFrame(day: number, month: number, year: number): number[] {
  const yy = year % 100
  return gtToIke([0x40, ObcId.date, day, month, yy])
}

export function obcSetLimitFrame(limit: number): number[] {
  const value = clampInt(limit, 1, 299)
  return gtToIke([0x40, ObcId.limit, (value >> 8) & 0xff, value & 0xff])
}

export function obcLimitControlFrame(action: 'on' | 'off' | 'current'): number[] {
  const control = action === 'on' ? ObcCtl.activate : action === 'off' ? ObcCtl.deactivate : ObcCtl.currentSpeed
  return gtToIke([0x41, ObcId.limit, control])
}

export function obcRecalculateFrame(property: 'consumption1' | 'consumption2' | 'avgSpeed'): number[] {
  const id = property === 'consumption1' ? ObcId.consumption1 : property === 'consumption2' ? ObcId.consumption2 : ObcId.avgSpeed
  return gtToIke([0x41, id, ObcCtl.recalculate])
}

export function obcTimerFrame(running: boolean): number[] {
  return gtToIke([0x41, ObcId.timer, running ? ObcCtl.activate : ObcCtl.deactivate])
}

export function obcRegionFrame(word: RegionWord): number[] {
  return gtToIke([0x15, word[0], word[1], word[2], word[3]])
}

const SPEED_DISTANCE_TEMP = 0x02 | 0x10 | 0x20 | 0x40
const CONSUMPTION_RANGE = 0x1f
const CLOCK_12H_BYTE1 = 0x01 | 0x80
const CLOCK_12H_BYTE2 = 0x20 | 0x40

export function applyUnitSystem(word: RegionWord, units: UnitSystem): RegionWord {
  let unitsByte = word[1] & ~SPEED_DISTANCE_TEMP
  let consumptionByte = word[2] & ~CONSUMPTION_RANGE
  if (units === 'imperial') {
    unitsByte |= 0x02 | 0x10 | 0x20 | 0x40
    consumptionByte |= 0x02 | 0x08 | 0x10
  }
  return [word[0], unitsByte, consumptionByte, word[3]]
}

export function applyClockFormat(word: RegionWord, format: ClockFormat): RegionWord {
  const unitsByte = format === '12h' ? word[1] | CLOCK_12H_BYTE1 : word[1] & ~CLOCK_12H_BYTE1
  const consumptionByte = format === '12h' ? word[2] | CLOCK_12H_BYTE2 : word[2] & ~CLOCK_12H_BYTE2
  return [word[0], unitsByte, consumptionByte, word[3]]
}

export function unitsFromRegion(word: RegionWord): UnitSystem {
  const imperial = (word[1] & 0x40) !== 0 && (word[1] & 0x02) !== 0
  return imperial ? 'imperial' : 'metric'
}

export function clockFromRegion(word: RegionWord): ClockFormat {
  return (word[1] & 0x01) !== 0 ? '12h' : '24h'
}

export function sameRegion(left: RegionWord, right: RegionWord): boolean {
  return left.every((byte, index) => byte === right[index])
}

export function interpretObcFrame(frame: IbusFrame, region: RegionWord | null): ObcBusUpdate | null {
  if (frame.source !== IKE || frame.data.length === 0) return null
  const command = frame.data[0]
  if (command === 0x15 && frame.data.length >= 5) {
    const word: RegionWord = [byteAt(frame.data, 1), byteAt(frame.data, 2), byteAt(frame.data, 3), byteAt(frame.data, 4)]
    return { region: word, units: unitsFromRegion(word), clockFormat: clockFromRegion(word) }
  }
  if (command === 0x2a && frame.data.length >= 3) {
    const status = byteAt(frame.data, 1)
    return {
      data: {
        limitEnabled: (status & 0x02) !== 0,
        timerRunning: (status & 0x08) !== 0,
      },
    }
  }
  if (command === 0x24 && frame.data.length >= 3) {
    return textUpdate(byteAt(frame.data, 1), ascii(frame.data.slice(3)), region)
  }
  return null
}

function textUpdate(property: number, text: string, region: RegionWord | null): ObcBusUpdate | null {
  if (property === ObcId.time) {
    const time = canonicalTime(text)
    return time ? { data: { time } } : null
  }
  if (property === ObcId.date) {
    const date = canonicalDate(text)
    return date ? { data: { date } } : null
  }
  if (property === ObcId.timer) {
    const timer = parseTimer(text)
    return timer === null ? null : { data: { timer } }
  }
  const value = metricValue(property, text, region)
  if (value === null) return null
  switch (property) {
    case ObcId.outTemp:
      return { data: { outTemp: round(value, 10) } }
    case ObcId.consumption1:
      return { data: { consumption1: round(value, 10) } }
    case ObcId.consumption2:
      return { data: { consumption2: round(value, 10) } }
    case ObcId.range:
      return { data: { range: Math.round(value) } }
    case ObcId.distance:
      return { data: { distance: round(value, 10) } }
    case ObcId.limit:
      return { data: { limit: Math.round(value), limitEnabled: true } }
    case ObcId.avgSpeed:
      return { data: { avgSpeed: round(value, 10) } }
    default:
      return null
  }
}

function metricValue(property: number, text: string, region: RegionWord | null): number | null {
  if (!/\d/.test(text)) return null
  const value = leadingNumber(text)
  if (value === null) return null
  const upper = text.toUpperCase()
  if (property === ObcId.outTemp) {
    const fahrenheit = upper.includes('F') || (region !== null && (region[1] & 0x02) !== 0 && !upper.includes('C'))
    return fahrenheit ? fromDisplayTemp(value, 'imperial') : value
  }
  if (property === ObcId.consumption1 || property === ObcId.consumption2) {
    return consumptionToLitresPer100(value, consumptionUnit(property, upper, region))
  }
  if (property === ObcId.avgSpeed || property === ObcId.limit) {
    return upper.includes('MPH') || (region !== null && speedIsMiles(property, region) && !upper.includes('KM'))
      ? fromDisplaySpeed(value, 'imperial')
      : value
  }
  const miles = upper.includes('MLS') || upper.includes('MILE') || /\bMI\b/.test(upper)
  return miles ? fromDisplayDistance(value, 'imperial') : value
}

function consumptionUnit(property: number, text: string, region: RegionWord | null): ConsumptionUnit {
  if (text.includes('L/100') || text.includes('L/ 100')) return 'l100'
  if (text.includes('KM/L')) return 'kml'
  if (region) {
    const bits = property === ObcId.consumption2 ? (region[2] >> 2) & 0b11 : region[2] & 0b11
    if (bits === 0) return 'l100'
    if (bits === 1) return 'mpg-uk'
    if (bits === 3) return 'kml'
    return 'mpg-us'
  }
  return text.includes('MPG') ? 'mpg-us' : 'l100'
}

function speedIsMiles(property: number, region: RegionWord): boolean {
  const mask = property === ObcId.limit ? 0x20 : 0x10
  return (region[1] & mask) !== 0
}

function canonicalTime(text: string): string | null {
  const match = /(\d{1,2})\s*:\s*(\d{2})(?::\d{2})?\s*(AM|PM)?/i.exec(text)
  if (!match?.[1] || !match[2]) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  if (minute > 59 || hour > 23) return null
  const suffix = match[3]?.toUpperCase()
  if (suffix) {
    if (hour < 1 || hour > 12) return null
    if (suffix === 'PM' && hour !== 12) hour += 12
    if (suffix === 'AM' && hour === 12) hour = 0
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function canonicalDate(text: string): string | null {
  const match = /(\d{1,2})[./](\d{1,2})[./](\d{2,4})/.exec(text)
  if (!match?.[1] || !match[2] || !match[3]) return null
  const dotted = text.includes('.')
  let day = Number(match[1])
  let month = Number(match[2])
  if (!dotted && day <= 12 && month > 12) {
    day = Number(match[2])
    month = Number(match[1])
  } else if (!dotted) {
    month = Number(match[1])
    day = Number(match[2])
  }
  let year = Number(match[3])
  if (year < 100) year += year >= 93 ? 1900 : 2000
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1993 || year > 2092) return null
  return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseTimer(text: string): number | null {
  const seconds = /(\d+(?:[.,]\d+)?)\s*SEC/i.exec(text)
  if (seconds?.[1]) return Number(seconds[1].replace(',', '.'))
  const minutes = /(\d+)\s*:\s*(\d{2})\s*MIN/i.exec(text)
  if (minutes?.[1] && minutes[2]) return Number(minutes[1]) * 60 + Number(minutes[2])
  const clock = /(\d+)\s*:\s*(\d{2})\s*:\s*(\d{2})/.exec(text)
  if (clock?.[1] && clock[2] && clock[3]) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
  return null
}

function leadingNumber(text: string): number | null {
  const match = /[+-]?\d+(?:[.,]\d+)?/.exec(text)
  if (!match) return null
  const value = Number(match[0].replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

function encodeHour(hour: number, format: ClockFormat): number {
  if (format === '24h') return hour
  const pm = hour >= 12
  const hour12 = hour % 12 || 12
  return (pm ? 0x80 : 0) | hour12
}

function gtToIke(data: readonly number[]): number[] {
  return [GT, 0x00, IKE, ...data]
}

function ascii(bytes: readonly number[]): string {
  let text = ''
  for (const byte of bytes) {
    if (byte >= 0x20 && byte <= 0x7e) text += String.fromCharCode(byte)
  }
  return text.trim()
}

function byteAt(bytes: readonly number[], index: number): number {
  return bytes[index] ?? 0
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function round(value: number, places: number): number {
  return Math.round(value * places) / places
}

function parseHex(input: string): number[] {
  const tokens = input
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && token.toLowerCase() !== 'xx')

  return tokens.map((token) => {
    if (!/^[0-9a-fA-F]{1,2}$/.test(token)) {
      throw new Error(`Invalid I-Bus hex token: ${token}`)
    }
    return Number.parseInt(token, 16)
  })
}
