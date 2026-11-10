export type ArtId = 'drive' | 'lake' | 'city'

export interface Track {
  title: string
  artist: string
  duration: number
  art: ArtId
}

export const TRACKS: readonly Track[] = [
  { title: 'Night Drive', artist: 'Cabin Radio', duration: 214, art: 'drive' },
  { title: 'Lakeshore', artist: 'Northbound', duration: 186, art: 'lake' },
  { title: 'Yard Lights', artist: 'Static Club', duration: 203, art: 'city' },
]

export function trackAt(index: number): Track {
  return TRACKS[index] ?? TRACKS[0]
}
