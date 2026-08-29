export {}

declare global {
  interface Window {
    api: {
      invoke(channel: string, payload?: unknown): Promise<unknown>
      on(channel: string, cb: (data: unknown) => void): () => void
    }
  }
}
