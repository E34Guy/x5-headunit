import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { startCanService, type CanService } from './can-service.js'
import { startGpsService, type GpsService } from './gps-service.js'
import { InpaBridge } from './inpa-bridge.js'
import {
  applyClockFormat,
  applyUnitSystem,
  clockFromRegion,
  formatIbusFrame,
  IbusService,
  interpretObcFrame,
  obcLimitControlFrame,
  obcPollFrames,
  obcRecalculateFrame,
  obcRegionFrame,
  obcSetDateFrame,
  obcSetLimitFrame,
  obcSetTimeFrame,
  obcTimerFrame,
  sameRegion,
  unitsFromRegion,
  type RegionWord,
} from './ibus-service.js'
import {
  IBUS_TRIGGERS,
  IpcChannel,
  isCarAction,
  isEqBandCommand,
  isInpaBounds,
  isObcCommand,
  isRoomPreset,
  type ClockFormat,
  type EqBandId,
  type GpsUpdate,
  type InpaBounds,
  type ObcCommand,
  type ObcSnapshot,
  type RoomPreset,
  type Telemetry,
  type UnitSystem,
} from '../src/protocol.js'

// Windows Shell Launcher / assigned access — configuration only, not executed.
const assignedAccessKiosk = {
  appId: 'e53-headunit',
  autoRestart: true,
  hideTaskbar: true,
  hideChrome: true,
} as const

const snapshot: Telemetry = {
  rpm: 0,
  speedKmh: 0,
  coolantC: 0,
  fuelPercent: 0,
  ibusConnected: false,
  canConnected: false,
  canSimulated: false,
  lastIbusFrame: null,
}

const audioMirror: {
  gains: Map<EqBandId, number>
  preset: RoomPreset
  volume: number
} = {
  gains: new Map(),
  preset: 'all',
  volume: 40,
}

let mainWindow: BrowserWindow | null = null
let ibus: IbusService | null = null
let can: CanService | null = null
let gps: GpsService | null = null
let regionWord: RegionWord | null = null
let pendingUnits: UnitSystem | null = null
let pendingClock: ClockFormat | null = null
const inpa = new InpaBridge()

void app.whenReady().then(() => {
  console.info(
    `[headunit] kiosk config loaded for ${assignedAccessKiosk.appId} (autoRestart=${String(assignedAccessKiosk.autoRestart)}, hideTaskbar=${String(assignedAccessKiosk.hideTaskbar)}, hideChrome=${String(assignedAccessKiosk.hideChrome)}); not executed`,
  )
  Menu.setApplicationMenu(null)
  registerIpc()
  createWindow()
  startServices()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  stopServices()
})

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 600,
    title: 'E53 X5 Headunit',
    backgroundColor: '#2b2e33',
    frame: false,
    fullscreenable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadFile(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  win.webContents.on('did-finish-load', () => {
    publish()
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  }
}

function registerIpc(): void {
  ipcMain.on(IpcChannel.carAction, (_event, payload) => {
    if (!isCarAction(payload)) return
    ibus?.transmit(IBUS_TRIGGERS[payload])
  })

  ipcMain.on(IpcChannel.eqBand, (_event, payload) => {
    if (!isEqBandCommand(payload)) return
    audioMirror.gains.set(payload.band, payload.gainDb)
  })

  ipcMain.on(IpcChannel.roomPreset, (_event, payload) => {
    if (!isRoomPreset(payload)) return
    audioMirror.preset = payload
  })

  ipcMain.on(IpcChannel.masterVolume, (_event, payload) => {
    if (typeof payload !== 'number' || !Number.isFinite(payload)) return
    audioMirror.volume = Math.min(100, Math.max(0, Math.round(payload)))
  })

  ipcMain.handle(IpcChannel.inpaOpen, (_event, payload) => {
    if (!isInpaBounds(payload)) {
      return { ok: false, embedded: false, mock: false, reason: 'Invalid INPA bounds' }
    }
    return inpa.open(scaleBounds(payload), parentHwnd())
  })

  ipcMain.handle(IpcChannel.inpaResize, (_event, payload) => {
    if (!isInpaBounds(payload)) {
      return { ok: false, embedded: false, mock: false, reason: 'Invalid INPA bounds' }
    }
    return inpa.resize(scaleBounds(payload), parentHwnd())
  })

  ipcMain.handle(IpcChannel.inpaClose, () => inpa.close())

  ipcMain.on(IpcChannel.obcCommand, (_event, payload) => {
    if (!isObcCommand(payload)) return
    sendObc(payload)
  })
}

function startServices(): void {
  ibus = new IbusService({
    onFrame: (frame) => {
      snapshot.lastIbusFrame = formatIbusFrame(frame)
      const update = interpretObcFrame(frame, regionWord)
      if (update) publishObc(applyPendingRegion(update))
      publish()
    },
    onConnection: (connected) => {
      snapshot.ibusConnected = connected
      publish()
    },
  })
  void ibus.start()

  can = startCanService((update) => {
    snapshot.rpm = update.rpm
    snapshot.speedKmh = update.speedKmh
    snapshot.coolantC = update.coolantC
    snapshot.fuelPercent = update.fuelPercent
    snapshot.canConnected = update.canConnected
    snapshot.canSimulated = update.canSimulated
    publish()
  })

  gps = startGpsService({
    onFix: (fix) => publishGps(fix),
    onConnection: (connected, path) => {
      if (connected) console.info(`[gps] connected ${path ?? ''}`)
      else console.info('[gps] disconnected')
    },
  })
  void gps.start()
}

function stopServices(): void {
  gps?.stop()
  gps = null
  can?.stop()
  can = null
  ibus?.stop()
  ibus = null
}

function sendObc(command: ObcCommand): void {
  switch (command.kind) {
    case 'poll':
      for (const frame of obcPollFrames()) transmit(frame)
      return
    case 'set-time':
      transmit(obcSetTimeFrame(command.hour, command.minute, command.format))
      return
    case 'set-date':
      transmit(obcSetDateFrame(command.day, command.month, command.year))
      return
    case 'set-limit':
      transmit(obcSetLimitFrame(command.limit))
      transmit(obcLimitControlFrame('on'))
      return
    case 'limit':
      transmit(obcLimitControlFrame(command.action))
      return
    case 'recalculate':
      transmit(obcRecalculateFrame(command.property))
      return
    case 'timer':
      transmit(obcTimerFrame(command.running))
      return
    case 'set-units':
      pendingUnits = command.units
      writePendingRegion()
      return
    case 'set-clock-format':
      pendingClock = command.format
      writePendingRegion()
      return
  }
}

function writePendingRegion(): void {
  if (!regionWord) {
    transmit(obcPollFrames()[0] ?? [0x3b, 0x00, 0x80, 0x14])
    return
  }
  const next = pendingRegion(regionWord)
  pendingUnits = null
  pendingClock = null
  if (!next || sameRegion(next, regionWord)) return
  regionWord = next
  transmit(obcRegionFrame(next))
  publishObc({ units: unitsFromRegion(next), clockFormat: clockFromRegion(next) })
}

function applyPendingRegion(update: NonNullable<ReturnType<typeof interpretObcFrame>>): ObcSnapshot {
  if (!update.region) return { data: update.data, units: update.units, clockFormat: update.clockFormat }
  let word = update.region
  if (pendingUnits || pendingClock) {
    const next = pendingRegion(word)
    pendingUnits = null
    pendingClock = null
    if (next && !sameRegion(next, word)) {
      word = next
      transmit(obcRegionFrame(word))
    }
  }
  regionWord = word
  return { data: update.data, units: unitsFromRegion(word), clockFormat: clockFromRegion(word) }
}

function pendingRegion(word: RegionWord): RegionWord | null {
  let next = word
  if (pendingUnits) next = applyUnitSystem(next, pendingUnits)
  if (pendingClock) next = applyClockFormat(next, pendingClock)
  return next
}

function transmit(frame: number[]): void {
  ibus?.transmit(frame)
}

function publishObc(update: ObcSnapshot): void {
  if (!update.data && !update.units && !update.clockFormat) return
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(IpcChannel.obcUpdate, update)
}

function publish(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(IpcChannel.telemetry, { ...snapshot })
}

function publishGps(fix: GpsUpdate): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(IpcChannel.gpsUpdate, fix)
}

function preloadFile(): string {
  const directory = path.dirname(fileURLToPath(import.meta.url))
  for (const name of ['preload.cjs', 'preload.mjs', 'preload.js']) {
    const candidate = path.join(directory, name)
    if (existsSync(candidate)) return candidate
  }
  return path.join(directory, 'preload.cjs')
}

/** Renderer bounds are CSS pixels. user32 SetWindowPos uses physical pixels. */
function scaleBounds(bounds: InpaBounds): InpaBounds {
  const win = mainWindow
  if (!win) return bounds
  const scale = screen.getDisplayMatching(win.getBounds()).scaleFactor
  return {
    x: Math.round(bounds.x * scale),
    y: Math.round(bounds.y * scale),
    width: Math.round(bounds.width * scale),
    height: Math.round(bounds.height * scale),
  }
}

function parentHwnd(): bigint {
  const handle = mainWindow?.getNativeWindowHandle()
  if (!handle || handle.length === 0) return 0n
  if (handle.length >= 8) return handle.readBigUInt64LE(0)
  return BigInt(handle.readUInt32LE(0))
}
