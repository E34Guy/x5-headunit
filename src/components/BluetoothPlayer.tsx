import { useEffect, useState } from 'react'
import { DspAudioStudio } from './DspAudioStudio'
import { trackAt, type ArtId } from '../media/tracks'
import { useVehicleStore } from '../store/vehicleStore'

export function AudioPage() {
  const [menu, setMenu] = useState<'player' | 'equalizer'>('player')
  return (
    <div className="h-full min-h-0">
      <div className="h-full" hidden={menu !== 'player'}>
        <BluetoothPlayer onOpenEqualizer={() => setMenu('equalizer')} />
      </div>
      <div className="h-full" hidden={menu !== 'equalizer'}>
        <DspAudioStudio onBack={() => setMenu('player')} />
      </div>
    </div>
  )
}

function BluetoothPlayer({ onOpenEqualizer }: { onOpenEqualizer: () => void }) {
  const masterVolume = useVehicleStore((state) => state.masterVolume)
  const setMasterVolume = useVehicleStore((state) => state.setMasterVolume)
  const setDspSource = useVehicleStore((state) => state.setDspSource)
  const trackIndex = useVehicleStore((state) => state.playback.trackIndex)
  const position = useVehicleStore((state) => state.playback.position)
  const playing = useVehicleStore((state) => state.playback.playing)
  const togglePlayback = useVehicleStore((state) => state.togglePlayback)
  const skipTrack = useVehicleStore((state) => state.skipTrack)
  const previousTrack = useVehicleStore((state) => state.previousTrack)
  const seekPlayback = useVehicleStore((state) => state.seekPlayback)
  const track = trackAt(trackIndex)

  useEffect(() => {
    setDspSource('bluetooth')
  }, [setDspSource])

  return (
    <section className="grid h-full min-h-0 grid-cols-[minmax(16rem,0.92fr)_minmax(0,1.08fr)] gap-4">
      <div className="grid min-h-0 place-items-center">
        <div className="aspect-square h-full max-h-full max-w-full overflow-hidden rounded-[2rem] shadow-card">
          <AlbumArt art={track.art} title={track.title} />
        </div>
      </div>
      <div className="flex min-h-0 flex-col justify-center gap-5 rounded-[2rem] bg-surface px-8 py-6 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-mint">
            <BluetoothIcon />
            Bluetooth · Phone
          </p>
          <button
            type="button"
            onClick={onOpenEqualizer}
            className="min-h-12 rounded-2xl bg-chip px-4 text-base font-semibold text-ink transition hover:bg-chip active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            Equalizer
          </button>
        </div>
        <div>
          <h2 className="text-4xl font-semibold leading-tight text-ink">{track.title}</h2>
          <p className="mt-1 text-xl text-muted">{track.artist}</p>
        </div>
        <div>
          <input
            type="range"
            min={0}
            max={track.duration}
            step={1}
            value={Math.min(position, track.duration)}
            aria-label="Playback position"
            onChange={(event) => seekPlayback(Number(event.target.value))}
            className="h-12 w-full cursor-pointer"
          />
          <div className="flex justify-between text-sm tabular-nums text-muted">
            <span>{formatTime(position)}</span>
            <span>-{formatTime(Math.max(0, track.duration - position))}</span>
          </div>
        </div>
        <div className="flex items-center justify-center gap-6">
          <TransportButton label="Previous track" onClick={previousTrack}>
            <SkipIcon direction="back" />
          </TransportButton>
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={playing ? 'Pause' : 'Play'}
            aria-pressed={playing}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-mint text-black shadow-card transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <TransportButton label="Next track" onClick={() => skipTrack(1)}>
            <SkipIcon direction="forward" />
          </TransportButton>
        </div>
        <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-chip px-4">
          <span className="text-sm font-medium text-muted">Vol</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={masterVolume}
            aria-label="Master volume"
            onChange={(event) => setMasterVolume(Number(event.target.value))}
            className="h-12 min-w-12 flex-1 cursor-pointer"
          />
          <span className="w-10 text-right text-sm font-medium tabular-nums text-ink">{masterVolume}</span>
        </label>
      </div>
    </section>
  )
}

function TransportButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-16 w-16 items-center justify-center rounded-full bg-chip text-ink transition hover:bg-chip active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
    >
      {children}
    </button>
  )
}

export function AlbumArt({ art, title }: { art: ArtId; title: string }) {
  return (
    <svg viewBox="0 0 400 400" role="img" aria-label={`${title} artwork`} className="h-full w-full">
      {art === 'drive' ? <DriveArt /> : null}
      {art === 'lake' ? <LakeArt /> : null}
      {art === 'city' ? <CityArt /> : null}
    </svg>
  )
}

function DriveArt() {
  return (
    <>
      <rect width="400" height="400" fill="#1c2430" />
      <circle cx="300" cy="92" r="54" fill="#ff6600" />
      <path d="M0 250 C80 210 140 280 210 240 C280 200 320 250 400 220 L400 400 L0 400 Z" fill="#2b3340" />
      <path d="M188 250 L212 250 L250 400 L150 400 Z" fill="#f3f4f6" />
      <path d="M196 292 H204 M194 328 H206 M192 364 H208" stroke="#1c2430" strokeWidth="8" strokeLinecap="round" />
      <path d="M70 318 h70 l18 28 H58 Z" fill="#ff6600" />
      <circle cx="86" cy="350" r="12" fill="#0f172a" />
      <circle cx="140" cy="350" r="12" fill="#0f172a" />
    </>
  )
}

function LakeArt() {
  return (
    <>
      <rect width="400" height="400" fill="#d7eef8" />
      <circle cx="92" cy="86" r="36" fill="#ff6600" />
      <path d="M0 190 L90 110 L160 176 L250 78 L400 190 L400 250 L0 250 Z" fill="#355c4a" />
      <path d="M0 210 L120 140 L190 196 L280 120 L400 214 L400 250 L0 250 Z" fill="#24362e" />
      <path d="M0 248 H400 V400 H0 Z" fill="#1c69d4" />
      <path d="M0 268 Q100 250 200 272 T400 260" fill="none" stroke="#f3f4f6" strokeWidth="8" />
      <path d="M20 320 Q120 300 220 324 T400 312" fill="none" stroke="#9ec6ef" strokeWidth="8" />
      <path d="M248 214 l28 36 h-56 Z" fill="#0f172a" />
    </>
  )
}

function CityArt() {
  return (
    <>
      <rect width="400" height="400" fill="#241c33" />
      <circle cx="310" cy="78" r="42" fill="#f3f4f6" />
      <rect x="28" y="168" width="70" height="232" fill="#3a3150" />
      <rect x="112" y="120" width="86" height="280" fill="#ff6600" />
      <rect x="214" y="188" width="64" height="212" fill="#4a4060" />
      <rect x="292" y="140" width="80" height="260" fill="#2a2438" />
      <g fill="#f3f4f6">
        <rect x="40" y="188" width="14" height="14" />
        <rect x="64" y="188" width="14" height="14" />
        <rect x="40" y="216" width="14" height="14" />
        <rect x="64" y="216" width="14" height="14" />
        <rect x="128" y="148" width="16" height="16" />
        <rect x="156" y="148" width="16" height="16" />
        <rect x="128" y="180" width="16" height="16" />
        <rect x="156" y="180" width="16" height="16" />
        <rect x="128" y="212" width="16" height="16" />
        <rect x="230" y="212" width="12" height="12" />
        <rect x="252" y="212" width="12" height="12" />
        <rect x="308" y="168" width="14" height="14" />
        <rect x="332" y="168" width="14" height="14" />
        <rect x="308" y="198" width="14" height="14" />
      </g>
    </>
  )
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const remainder = whole % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

function BluetoothIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 7l10 10-5 4V3l5 4L7 17" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ml-1 h-9 w-9" aria-hidden="true" fill="currentColor">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9" aria-hidden="true" fill="currentColor">
      <rect x="6" y="5" width="4.2" height="14" rx="1" />
      <rect x="13.8" y="5" width="4.2" height="14" rx="1" />
    </svg>
  )
}

function SkipIcon({ direction }: { direction: 'back' | 'forward' }) {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true" fill="currentColor">
      {direction === 'back' ? (
        <>
          <path d="M6 5h2.4v14H6z" />
          <path d="M19 6.2 10 12l9 5.8z" />
        </>
      ) : (
        <>
          <path d="M5 6.2 14 12 5 17.8z" />
          <path d="M15.6 5H18v14h-2.4z" />
        </>
      )}
    </svg>
  )
}
