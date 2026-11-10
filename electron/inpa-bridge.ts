import { execFile } from 'node:child_process'

import type { InpaBounds, InpaEmbedResult } from '../src/protocol.js'

/**
 * INPALOAD window embedding.
 * macOS and Linux stay in mock mode and do not load user32.
 * On Windows the calls are FindWindowW, SetParent, SetWindowPos, and ShowWindow in user32.dll.
 */

const INPA_WINDOW_TITLE = 'INPALOAD'
const WINDOWS_REQUIRED = 'user32 embedding requires Windows'

/**
 * user32.dll
 * FindWindowW(lpClassName: LPCWSTR | null, lpWindowName: LPCWSTR) -> HWND
 * SetParent(hWndChild: HWND, hWndNewParent: HWND) -> HWND
 * SetWindowPos(hWnd: HWND, hWndInsertAfter: HWND, X: int, Y: int, cx: int, cy: int, uFlags: UINT) -> BOOL
 * ShowWindow(hWnd: HWND, nCmdShow: int) -> BOOL
 *
 * SW_HIDE = 0, SW_SHOW = 5, SWP_NOZORDER = 0x0004, SWP_SHOWWINDOW = 0x0040.
 */
const USER32_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HeadunitUser32 {
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr FindWindow(IntPtr lpClassName, string lpWindowName);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
'@
$action = $env:HU_ACTION
$title = $env:HU_TITLE
$child = [HeadunitUser32]::FindWindow([IntPtr]::Zero, $title)
if ($child -eq [IntPtr]::Zero) {
  Write-Output 'NOTFOUND'
  exit 2
}
if ($action -eq 'close') {
  [void][HeadunitUser32]::ShowWindow($child, 0)
  Write-Output 'OK'
  exit 0
}
$parentValue = [int64]$env:HU_PARENT
if ($parentValue -eq 0) {
  Write-Output 'NOPARENT'
  exit 3
}
$parent = New-Object System.IntPtr $parentValue
[void][HeadunitUser32]::SetParent($child, $parent)
$x = [int]$env:HU_X
$y = [int]$env:HU_Y
$w = [int]$env:HU_W
$h = [int]$env:HU_H
[void][HeadunitUser32]::SetWindowPos($child, [IntPtr]::Zero, $x, $y, $w, $h, 68)
[void][HeadunitUser32]::ShowWindow($child, 5)
Write-Output 'OK'
`

type EmbedAction = 'open' | 'resize' | 'close'

export class InpaBridge {
  open(bounds: InpaBounds, parentHwnd: bigint): Promise<InpaEmbedResult> {
    return this.place('open', bounds, parentHwnd)
  }

  resize(bounds: InpaBounds, parentHwnd: bigint): Promise<InpaEmbedResult> {
    return this.place('resize', bounds, parentHwnd)
  }

  close(): Promise<InpaEmbedResult> {
    return this.place('close', { x: 0, y: 0, width: 0, height: 0 }, 0n)
  }

  private async place(
    action: EmbedAction,
    bounds: InpaBounds,
    parentHwnd: bigint,
  ): Promise<InpaEmbedResult> {
    if (process.platform !== 'win32') {
      return { ok: false, embedded: false, mock: true, reason: WINDOWS_REQUIRED }
    }
    return runUser32(action, bounds, parentHwnd)
  }
}

function runUser32(
  action: EmbedAction,
  bounds: InpaBounds,
  parentHwnd: bigint,
): Promise<InpaEmbedResult> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HU_ACTION: action,
    HU_TITLE: INPA_WINDOW_TITLE,
    HU_PARENT: parentHwnd.toString(),
    HU_X: String(Math.round(bounds.x)),
    HU_Y: String(Math.round(bounds.y)),
    HU_W: String(Math.max(0, Math.round(bounds.width))),
    HU_H: String(Math.max(0, Math.round(bounds.height))),
  }

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', USER32_SCRIPT],
      { windowsHide: true, env, timeout: 20000 },
      (error, stdout, stderr) => {
        resolve(resultFromPowerShell(action, stdout, stderr, error))
      },
    )
  })
}

function resultFromPowerShell(
  action: EmbedAction,
  stdout: string,
  stderr: string,
  error: Error | null,
): InpaEmbedResult {
  const marker = lastLine(stdout)
  if (marker === 'OK') {
    return { ok: true, embedded: action !== 'close', mock: false }
  }
  if (marker === 'NOTFOUND') {
    if (action === 'close') return { ok: true, embedded: false, mock: false }
    return { ok: false, embedded: false, mock: false, reason: 'INPALOAD window was not found' }
  }
  if (marker === 'NOPARENT') {
    return { ok: false, embedded: false, mock: false, reason: 'Headunit window handle is missing' }
  }

  const detail = lastLine(stderr) || (error ? error.message : 'user32 call failed')
  return { ok: false, embedded: false, mock: false, reason: detail }
}

function lastLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return lines.at(-1) ?? ''
}
