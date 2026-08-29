import { promises as fsp } from 'node:fs'
import crypto from 'node:crypto'
import { parentPort } from 'node:worker_threads'

/** 哈希 worker：partial = 头 64KB，full = 全文件 SHA-256 */
const PARTIAL_SIZE = 64 * 1024
const READ_CHUNK = 1024 * 1024

async function hashFile(filePath: string, mode: 'partial' | 'full'): Promise<string> {
  const hash = crypto.createHash('sha256')
  const fh = await fsp.open(filePath, 'r')
  try {
    const total = mode === 'partial' ? PARTIAL_SIZE : Infinity
    let remaining = total
    const buf = Buffer.alloc(READ_CHUNK)
    while (remaining > 0) {
      const want = Math.min(buf.length, remaining)
      const { bytesRead } = await fh.read(buf, 0, want, null)
      if (bytesRead <= 0) break
      hash.update(buf.subarray(0, bytesRead))
      remaining -= bytesRead
    }
  } finally {
    await fh.close()
  }
  return hash.digest('hex')
}

parentPort!.on('message', (m: { job: string; path?: string; mode?: 'partial' | 'full' }) => {
  if (m.job === 'hash' && m.path) {
    hashFile(m.path, m.mode ?? 'full')
      .then((h) => parentPort!.postMessage({ path: m.path, hash: h, error: null as string | null }))
      .catch((e: Error) => parentPort!.postMessage({ path: m.path, hash: '', error: e.message }))
  }
})
