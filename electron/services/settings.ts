import { readFileSync, promises as fsp } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { AppSettings } from '../../shared/types'
import { DEFAULT_EXCLUDES } from '../../shared/constants'

const DEFAULTS: AppSettings = {
  defaultDeleteMode: 'recycle',
  excludes: [...DEFAULT_EXCLUDES],
  confirmProtected: true
}

let cached: AppSettings | null = null

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  if (cached) return cached
  try {
    const raw = readFileSync(settingsFile(), 'utf8')
    cached = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    cached = { ...DEFAULTS }
  }
  return cached
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next: AppSettings = { ...getSettings(), ...patch }
  await fsp.writeFile(settingsFile(), JSON.stringify(next, null, 2), 'utf8')
  cached = next
  return next
}
