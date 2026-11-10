/// <reference types="vite/client" />

import type { HeadunitApi } from './protocol'

declare global {
  interface Window {
    headunit: HeadunitApi
  }
}

export {}
