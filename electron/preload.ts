import { contextBridge, ipcRenderer } from 'electron'

import {
  IpcChannel,
  isGpsUpdate,
  isInpaEmbedResult,
  isObcSnapshot,
  isTelemetry,
  type CarAction,
  type EqBandId,
  type HeadunitApi,
  type InpaBounds,
  type InpaEmbedResult,
  type ObcCommand,
  type RoomPreset,
} from '../src/protocol.js'

const unexpectedInpa: InpaEmbedResult = {
  ok: false,
  embedded: false,
  mock: true,
  reason: 'Unexpected INPA response',
}

const api: HeadunitApi = {
  subscribeTelemetry(listener) {
    const onTelemetry = (_event: unknown, payload: unknown) => {
      if (isTelemetry(payload)) listener(payload)
    }
    ipcRenderer.on(IpcChannel.telemetry, onTelemetry)
    return () => {
      ipcRenderer.removeListener(IpcChannel.telemetry, onTelemetry)
    }
  },
  sendCarControl(action: CarAction) {
    ipcRenderer.send(IpcChannel.carAction, action)
  },
  setEqBand(band: EqBandId, gainDb: number) {
    ipcRenderer.send(IpcChannel.eqBand, { band, gainDb })
  },
  setRoomPreset(preset: RoomPreset) {
    ipcRenderer.send(IpcChannel.roomPreset, preset)
  },
  setMasterVolume(volume: number) {
    ipcRenderer.send(IpcChannel.masterVolume, volume)
  },
  async openInpa(bounds: InpaBounds) {
    return readInpa(await ipcRenderer.invoke(IpcChannel.inpaOpen, bounds))
  },
  async closeInpa() {
    return readInpa(await ipcRenderer.invoke(IpcChannel.inpaClose))
  },
  async resizeInpa(bounds: InpaBounds) {
    return readInpa(await ipcRenderer.invoke(IpcChannel.inpaResize, bounds))
  },
  sendObc(command: ObcCommand) {
    ipcRenderer.send(IpcChannel.obcCommand, command)
  },
  subscribeObc(listener) {
    const onUpdate = (_event: unknown, payload: unknown) => {
      if (isObcSnapshot(payload)) listener(payload)
    }
    ipcRenderer.on(IpcChannel.obcUpdate, onUpdate)
    return () => {
      ipcRenderer.removeListener(IpcChannel.obcUpdate, onUpdate)
    }
  },
  subscribeGps(listener) {
    const onFix = (_event: unknown, payload: unknown) => {
      if (isGpsUpdate(payload)) listener(payload)
    }
    ipcRenderer.on(IpcChannel.gpsUpdate, onFix)
    return () => {
      ipcRenderer.removeListener(IpcChannel.gpsUpdate, onFix)
    }
  },
}

contextBridge.exposeInMainWorld('headunit', api)

function readInpa(value: unknown): InpaEmbedResult {
  return isInpaEmbedResult(value) ? value : unexpectedInpa
}
