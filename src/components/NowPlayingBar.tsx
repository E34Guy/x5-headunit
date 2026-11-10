import { AlbumArt } from './BluetoothPlayer'
import { trackAt } from '../media/tracks'
import { useVehicleStore } from '../store/vehicleStore'

export function NowPlayingBar() {
  const trackIndex = useVehicleStore((state) => state.playback.trackIndex)
  const playing = useVehicleStore((state) => state.playback.playing)
  const togglePlayback = useVehicleStore((state) => state.togglePlayback)
  const skipTrack = useVehicleStore((state) => state.skipTrack)
  const previousTrack = useVehicleStore((state) => state.previousTrack)
  const track = trackAt(trackIndex)

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl bg-surface p-3 shadow-card">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="aspect-square h-full max-h-full w-auto max-w-full overflow-hidden rounded-xl">
          <AlbumArt art={track.art} title={track.title} />
        </div>
      </div>
      <div className="min-w-0 shrink-0 text-center">
        <p className="truncate text-base font-semibold leading-tight text-ink">{track.title}</p>
        <p className="truncate text-sm text-muted">{track.artist}</p>
      </div>
      <div className="flex w-full shrink-0 items-center justify-evenly gap-2 px-0.5 pb-0.5 pt-1">
        <BarButton label="Previous track" onClick={previousTrack}>
          <SkipIcon direction="back" />
        </BarButton>
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={playing ? 'Pause' : 'Play'}
          aria-pressed={playing}
          className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-mint text-black transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <BarButton label="Next track" onClick={() => skipTrack(1)}>
          <SkipIcon direction="forward" />
        </BarButton>
      </div>
    </section>
  )
}

function BarButton({
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

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ml-0.5 h-8 w-8" aria-hidden="true" fill="currentColor">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true" fill="currentColor">
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
