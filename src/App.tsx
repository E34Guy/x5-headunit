import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { CarControls } from './components/CarControls'
import { AudioPage } from './components/BluetoothPlayer'
import { NavigationMap } from './components/NavigationMap'
import { NowPlayingBar } from './components/NowPlayingBar'
import { InpaModal } from './components/InpaModal'
import { OBCMenu } from './components/OBCMenu'
import { SystemSettings } from './components/SystemSettings'
import { formatClock, formatConsumption, formatDistance, formatTemp, resolveClock } from './obc/display'
import { useVehicleStore } from './store/vehicleStore'

type CabinView = 'navigation' | 'home' | 'audio' | 'vehicle' | 'settings'

const PAGES = ['navigation', 'home', 'audio', 'vehicle', 'settings'] as const satisfies readonly CabinView[]

const THEME_KEY = 'headunit-theme'
const BRIGHT_KEY = 'headunit-brightness'

const NAV: readonly { id: CabinView; label: string; prominent?: boolean }[] = [
  { id: 'navigation', label: 'Navigation' },
  { id: 'home', label: 'Home', prominent: true },
  { id: 'audio', label: 'Audio' },
  { id: 'vehicle', label: 'Vehicle info' },
]

export default function App() {
  const setTelemetry = useVehicleStore((state) => state.setTelemetry)
  const toggleInpa = useVehicleStore((state) => state.toggleInpa)
  const ibusConnected = useVehicleStore((state) => state.telemetry.ibusConnected)
  const canConnected = useVehicleStore((state) => state.telemetry.canConnected)
  const canSimulated = useVehicleStore((state) => state.telemetry.canSimulated)
  const inpaOpen = useVehicleStore((state) => state.inpa.open)
  const applyClusterObc = useVehicleStore((state) => state.applyClusterObc)
  const obcData = useVehicleStore((state) => state.obcData)
  const units = useVehicleStore((state) => state.units)
  const clockFormat = useVehicleStore((state) => state.clockFormat)
  const obcClockAt = useVehicleStore((state) => state.obcClockAt)
  const bluetooth = useVehicleStore((state) => state.dspSource) === 'bluetooth'
  const [view, setView] = useState<CabinView>('home')
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const swipe = useRef<Swipe | null>(null)
  const suppressClick = useRef(false)
  const [now, setNow] = useState(() => Date.now())
  const [dark, setDark] = useState(storedDark)
  const [brightness, setBrightness] = useState(storedBrightness)

  useEffect(() => {
    const api = window.headunit
    if (!api) return
    return api.subscribeTelemetry(setTelemetry)
  }, [setTelemetry])

  useEffect(() => {
    const api = window.headunit
    if (!api) return
    return api.subscribeObc(applyClusterObc)
  }, [applyClusterObc])

  useEffect(() => {
    const api = window.headunit
    if (!api?.subscribeGps) return
    return api.subscribeGps((fix) => useVehicleStore.getState().applyLiveGps(fix))
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.setProperty('--screen', `${brightness}%`)
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
      localStorage.setItem(BRIGHT_KEY, String(brightness))
    } catch {
      /* private browsing can block storage */
    }
  }, [dark, brightness])

  const clock = resolveClock(obcData.time, obcData.date, obcClockAt, now)
  const canText = canConnected ? 'CAN' : canSimulated ? 'CAN sim' : 'CAN off'
  const pageIndex = Math.max(0, PAGES.indexOf(view))
  const pageSpan = 100 / PAGES.length

  const finishSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = swipe.current
    swipe.current = null
    if (!gesture || gesture.id !== event.pointerId) return
    if (gesture.active) {
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      } catch {
        /* Pointer capture is unavailable for some synthetic events. */
      }
    }
    const dx = event.clientX - gesture.x
    const elapsed = Math.max(1, Date.now() - gesture.at)
    const velocity = dx / elapsed
    const distance = gesture.active ? resistedDrag(dx, pageIndex, PAGES.length) : 0
    const forward = distance < -72 || velocity < -0.55
    const backward = distance > 72 || velocity > 0.55
    if (gesture.active && forward && pageIndex < PAGES.length - 1) setView(PAGES[pageIndex + 1])
    else if (gesture.active && backward && pageIndex > 0) setView(PAGES[pageIndex - 1])
    if (gesture.active) suppressClick.current = true
    setDragX(0)
    setDragging(false)
  }

  return (
    <div className="cabin flex h-screen touch-manipulation select-none flex-col overflow-hidden text-ink">
      <header className="flex h-12 shrink-0 items-center justify-between px-5 text-on-canvas-muted">
        <time className="text-base font-medium text-on-canvas" dateTime={clock.toISOString()}>
          {formatClock(clock, clockFormat)}
        </time>
        <div className="flex items-center gap-4 text-sm">
          <span className="font-medium text-on-canvas">{formatTemp(obcData.outTemp, units)}</span>
          <StatusIcon label={bluetooth ? 'Bluetooth on' : 'Bluetooth off'} active={bluetooth}>
            <BluetoothIcon />
          </StatusIcon>
          <StatusIcon label="Wi-Fi unavailable" active={false}>
            <WifiIcon />
          </StatusIcon>
          <button
            type="button"
            onClick={() => setView('settings')}
            aria-current={view === 'settings' ? 'page' : undefined}
            aria-label="System settings"
            className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
              view === 'settings' ? 'bg-mint text-black' : 'text-on-canvas-muted hover:bg-white/10 hover:text-on-canvas'
            }`}
          >
            <GearIcon />
          </button>
          <span className={ibusConnected ? 'font-medium text-mint' : ''}>
            {ibusConnected ? 'I-Bus' : 'I-Bus off'}
          </span>
          <span className={canConnected ? 'font-medium text-mint' : ''}>{canText}</span>
        </div>
      </header>
      <main
        className="min-h-0 flex-1 touch-pan-y overflow-hidden"
        onPointerDown={(event) => {
          if (event.button !== 0 || shouldKeepGesture(event.target)) return
          swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: Date.now(), active: false }
        }}
        onPointerMove={(event) => {
          const gesture = swipe.current
          if (!gesture || gesture.id !== event.pointerId) return
          const dx = event.clientX - gesture.x
          const dy = event.clientY - gesture.y
          if (!gesture.active) {
            if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
            if (Math.abs(dx) < Math.abs(dy)) {
              swipe.current = null
              return
            }
            gesture.active = true
            setDragging(true)
            try {
              event.currentTarget.setPointerCapture(event.pointerId)
            } catch {
              /* Pointer capture is unavailable for some synthetic events. */
            }
          }
          setDragX(resistedDrag(dx, pageIndex, PAGES.length))
        }}
        onPointerUp={finishSwipe}
        onPointerCancel={finishSwipe}
        onClickCapture={(event) => {
          if (!suppressClick.current) return
          suppressClick.current = false
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <div
          className="flex h-full"
          style={{
            width: `${PAGES.length * 100}%`,
            transform: `translate3d(calc(${-pageIndex * pageSpan}% + ${dragX}px), 0, 0)`,
            transition: dragging ? 'none' : 'transform 460ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {PAGES.map((page) => (
            <section
              key={page}
              className={`h-full min-w-0 shrink-0 ${page === 'navigation' ? 'px-2 pb-1 pt-0' : 'px-4 pb-2 pt-1'}`}
              style={{ width: `${pageSpan}%` }}
              aria-hidden={view !== page}
            >
              {page === 'navigation' ? <NavigationPage /> : null}
              {page === 'home' ? <HomeDeck /> : null}
              {page === 'audio' ? <AudioPage /> : null}
              {page === 'vehicle' ? <VehicleInfo /> : null}
              {page === 'settings' ? (
                <SystemSettings
                  dark={dark}
                  brightness={brightness}
                  onDark={setDark}
                  onBrightness={setBrightness}
                />
              ) : null}
            </section>
          ))}
        </div>
      </main>
      <nav className="mx-4 mb-3 grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center rounded-2xl bg-nav px-2 shadow-card backdrop-blur">
        <div className="flex items-center justify-evenly gap-1">
          <NavButton label="INPA" active={inpaOpen} onClick={toggleInpa}>
            <ToolIcon />
          </NavButton>
          <NavItem id="navigation" active={view === 'navigation'} onClick={() => setView('navigation')} />
        </div>
        <NavItem id="home" active={view === 'home'} prominent onClick={() => setView('home')} />
        <div className="flex items-center justify-evenly gap-1">
          <NavItem id="audio" active={view === 'audio'} onClick={() => setView('audio')} />
          <NavItem id="vehicle" active={view === 'vehicle'} onClick={() => setView('vehicle')} />
        </div>
      </nav>
      {inpaOpen ? <InpaModal /> : null}
    </div>
  )
}

type Swipe = { id: number; x: number; y: number; at: number; active: boolean }

function shouldKeepGesture(target: EventTarget): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('.maplibregl-map, input, textarea, select'))
}

function resistedDrag(dx: number, index: number, count: number): number {
  const pastStart = index === 0 && dx > 0
  const pastEnd = index === count - 1 && dx < 0
  return pastStart || pastEnd ? dx * 0.28 : dx
}

function storedDark(): boolean {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark'
  } catch {
    return false
  }
}

function storedBrightness(): number {
  try {
    const value = Number(localStorage.getItem(BRIGHT_KEY))
    if (value >= 40 && value <= 100) return value
  } catch {
    /* ignore unreadable storage */
  }
  return 100
}

function NavigationPage() {
  return (
    <div className="h-full min-h-0">
      <NavigationMap layout="stage" />
    </div>
  )
}

function VehicleInfo() {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.45fr)_minmax(14rem,0.55fr)] gap-4">
      <OBCMenu title="Vehicle info" />
      <CarControls embedded />
    </div>
  )
}

function NavItem({
  id,
  active,
  prominent = false,
  onClick,
}: {
  id: CabinView
  active: boolean
  prominent?: boolean
  onClick: () => void
}) {
  const item = NAV.find((entry) => entry.id === id)
  return (
    <NavButton label={item?.label ?? id} active={active} prominent={prominent} onClick={onClick}>
      {id === 'navigation' ? <NavigationIcon /> : null}
      {id === 'home' ? <HomeIcon /> : null}
      {id === 'audio' ? <AudioIcon /> : null}
      {id === 'vehicle' ? <CarIcon /> : null}
    </NavButton>
  )
}

function HomeDeck() {
  const range = useVehicleStore((state) => state.obcData.range)
  const consumption = useVehicleStore((state) => state.obcData.consumption1)
  const units = useVehicleStore((state) => state.units)

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_16rem] gap-4">
      <NavigationMap />
      <div className="flex min-h-0 flex-col gap-3">
        <TripFigure label="Range" value={formatDistance(range, units)} />
        <TripFigure label="Consumption" value={formatConsumption(consumption, units)} />
        <NowPlayingBar />
      </div>
    </div>
  )
}

function TripFigure({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl bg-surface px-4 py-3 shadow-card">
      <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{label}</h2>
      <p className="mt-1 text-3xl font-semibold tabular-nums leading-none text-ink">{value}</p>
    </article>
  )
}

function StatusIcon({
  label,
  active,
  children,
}: {
  label: string
  active: boolean
  children: ReactNode
}) {
  return (
    <span className={active ? 'text-mint' : 'text-on-canvas-muted'} role="img" aria-label={label} title={label}>
      {children}
    </span>
  )
}

function NavButton({
  label,
  active,
  prominent = false,
  onClick,
  children,
}: {
  label: string
  active: boolean
  prominent?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center justify-center transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint ${
        prominent
          ? `h-16 w-16 rounded-full ${active ? 'bg-mint text-black' : 'text-ink hover:bg-chip'}`
          : `min-h-12 min-w-12 flex-col gap-0.5 rounded-2xl px-3 text-xs font-medium ${
              active ? 'bg-mint text-black' : 'text-muted hover:bg-chip hover:text-ink'
            }`
      }`}
    >
      {children}
      {prominent ? null : label}
    </button>
  )
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 11.5 12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 10.5V20h10v-9.5" strokeLinejoin="round" />
    </svg>
  )
}

function NavigationIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 5 20l7-3 7 3Z" strokeLinejoin="round" />
      <path d="M12 8v9" strokeLinecap="round" />
    </svg>
  )
}

function AudioIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 18V7l10-2v11" strokeLinejoin="round" />
      <circle cx="7" cy="18" r="2.2" />
      <circle cx="17" cy="16" r="2.2" />
    </svg>
  )
}

function CarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 15v2M20 15v2M5 15h14l-1.2-4.2a2 2 0 0 0-1.9-1.4H8.1a2 2 0 0 0-1.9 1.4L5 15Z" strokeLinejoin="round" />
      <circle cx="7.5" cy="16.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="16.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ToolIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14.5 6.5a3.5 3.5 0 0 0-4.8 4.6L4 16.8 7.2 20l5.7-5.7a3.5 3.5 0 0 0 4.6-4.8L15 12l-3-3 2.5-2.5Z" strokeLinejoin="round" />
    </svg>
  )
}

function BluetoothIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 7l10 10-5 4V3l5 4L7 17" strokeLinejoin="round" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"
        strokeLinecap="round"
      />
    </svg>
  )
}

function WifiIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 10a10 10 0 0 1 14 0" strokeLinecap="round" />
      <path d="M8 13a6 6 0 0 1 8 0" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}
