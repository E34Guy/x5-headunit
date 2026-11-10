import { useEffect, useRef, useState } from 'react'
import type { InpaBounds } from '../protocol'
import { useVehicleStore } from '../store/vehicleStore'

export function InpaModal() {
  const toggleInpa = useVehicleStore((state) => state.toggleInpa)
  const mock = useVehicleStore((state) => state.inpa.mock)
  const setInpaMock = useVehicleStore((state) => state.setInpaMock)
  const frameRef = useRef<HTMLDivElement>(null)
  const [detail, setDetail] = useState<string | null>(null)

  useEffect(() => {
    const frame = frameRef.current
    const api = window.headunit
    if (!frame || !api) {
      setInpaMock(true)
      return
    }

    const boundsOf = (): InpaBounds => {
      const rect = frame.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }

    let cancelled = false
    void api.openInpa(boundsOf()).then((result) => {
      if (cancelled) return
      setInpaMock(result.mock)
      setDetail(result.embedded ? null : (result.reason ?? null))
    })

    const observer = new ResizeObserver(() => {
      void api.resizeInpa(boundsOf())
    })
    observer.observe(frame)

    return () => {
      cancelled = true
      observer.disconnect()
      void api.closeInpa()
    }
  }, [setInpaMock])

  return (
    <div className="cabin fixed inset-0 z-20 flex flex-col overflow-hidden text-ink">
      <header className="flex h-14 shrink-0 items-center justify-between px-5">
        <h2 className="text-xl font-semibold text-on-canvas">INPA</h2>
        <button
          type="button"
          onClick={toggleInpa}
          className="min-h-12 min-w-12 rounded-2xl bg-surface px-5 text-base font-semibold text-ink shadow-sm transition hover:bg-chip active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          Close
        </button>
      </header>
      <div
        ref={frameRef}
        className="relative m-4 min-h-0 flex-1 rounded-2xl border border-dashed border-line bg-surface shadow-card"
        aria-label="INPALOAD window"
      >
        <p className="pointer-events-none absolute left-4 top-4 text-sm uppercase tracking-[0.2em] text-muted">
          INPALOAD
        </p>
        {mock ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-3xl font-semibold text-ink">Mock mode</p>
            <p className="max-w-xl text-lg text-muted">
              INPALOAD.exe is parented into this frame on Windows. This panel stands in for that
              window.
            </p>
          </div>
        ) : detail ? (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <p className="max-w-xl text-xl text-ink">{detail}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
