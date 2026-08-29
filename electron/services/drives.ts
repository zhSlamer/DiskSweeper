import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import type { DriveInfo } from '../../shared/types'

const PS_SCRIPT =
  "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " +
  'Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -in 2,3,4 } | ' +
  'Select-Object DeviceID,VolumeName,DriveType,FileSystem,Size,FreeSpace | ConvertTo-Json -Compress'

function psExec(script: string, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) reject(err)
        else resolve(stdout)
      }
    )
  })
}

type PsDrive = {
  DeviceID: string
  VolumeName: string | null
  DriveType: number
  FileSystem: string | null
  Size: number | null
  FreeSpace: number | null
}

function mapType(n: number): DriveInfo['type'] {
  if (n === 3) return 'fixed'
  if (n === 2) return 'removable'
  if (n === 4) return 'network'
  return 'other'
}

async function psDrives(): Promise<DriveInfo[]> {
  const out = await psExec(PS_SCRIPT)
  const text = out.trim()
  if (!text) return []
  let parsed: unknown = JSON.parse(text)
  if (!Array.isArray(parsed)) parsed = [parsed]
  const list = (parsed as PsDrive[])
    .filter((d) => d && typeof d.DeviceID === 'string' && d.DeviceID)
    .map((d) => ({
      letter: d.DeviceID.toUpperCase(),
      label: d.VolumeName ?? '',
      type: mapType(d.DriveType),
      fileSystem: d.FileSystem ?? '',
      total: d.Size ?? 0,
      free: d.FreeSpace ?? 0
    }))
  return list
}

async function probeDrives(): Promise<DriveInfo[]> {
  const list: DriveInfo[] = []
  for (let i = 67; i <= 90; i++) {
    const letter = String.fromCharCode(i) + ':'
    try {
      const st = await fsp.statfs(letter + '\\')
      if (st.blocks > 0) {
        list.push({
          letter,
          label: '',
          type: 'fixed',
          fileSystem: '',
          total: st.bsize * st.blocks,
          free: st.bfree * st.bsize
        })
      }
    } catch {
      /* 无此盘符 */
    }
  }
  return list
}

export async function listDrives(): Promise<DriveInfo[]> {
  let list: DriveInfo[] = []
  try {
    list = await psDrives()
  } catch {
    list = []
  }
  if (list.length === 0) list = await probeDrives()
  // 用 statfs 刷新实时容量
  for (const d of list) {
    try {
      const st = await fsp.statfs(d.letter + '\\')
      if (st.blocks > 0) {
        d.total = st.bsize * st.blocks
        d.free = st.bfree * st.bsize
      }
    } catch {
      /* 忽略 */
    }
  }
  return list
}
