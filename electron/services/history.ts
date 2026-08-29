import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { HistoryEntry } from '../../shared/types'

const DISPLAY_LIMIT = 1000

function historyFile(): string {
  return path.join(app.getPath('userData'), 'history.jsonl')
}

export async function appendHistory(entry: HistoryEntry): Promise<void> {
  try {
    await fsp.appendFile(historyFile(), JSON.stringify(entry) + '\n', 'utf8')
  } catch {
    /* 历史记录失败不影响主操作 */
  }
}

export async function listHistory(): Promise<HistoryEntry[]> {
  let raw = ''
  try {
    raw = await fsp.readFile(historyFile(), 'utf8')
  } catch {
    return []
  }
  const out: HistoryEntry[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      out.push(JSON.parse(t))
    } catch {
      /* 跳过损坏行 */
    }
  }
  return out.reverse().slice(0, DISPLAY_LIMIT)
}

export async function clearHistory(): Promise<void> {
  await fsp.writeFile(historyFile(), '', 'utf8')
}
