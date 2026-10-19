/// <reference types="vite/client" />

interface Window {
  sonicflow?: {
    getConnectionUrl: () => Promise<string>
  }
}