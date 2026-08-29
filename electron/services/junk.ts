import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { JunkCategory, JunkCleanResult, JunkEstimate } from '../../shared/types'

interface JunkDef {
  id: string
  name: string
  desc: string
  paths: (env: NodeJS.ProcessEnv) => string[]
  special?: 'recyclebin'
  safety: 'safe' | 'caution'
  note?: string
}

const DEFS: JunkDef[] = [
  {
    id: 'user-temp',
    name: '用户临时文件',
    desc: '当前用户 %TEMP% 目录下的临时文件',
    paths: (env) => [env.TEMP ?? path.join(os.homedir(), 'AppData\\Local\\Temp')],
    safety: 'safe'
  },
  {
    id: 'windows-temp',
    name: '系统临时文件',
    desc: 'Windows\\Temp 系统临时目录（可能需要管理员权限）',
    paths: (env) => [(env.SystemDrive ?? 'C:') + '\\Windows\\Temp'],
    safety: 'safe',
    note: '无权限的文件会自动跳过'
  },
  {
    id: 'prefetch',
    name: 'Prefetch 预读文件',
    desc: 'Windows 预读缓存，清理后短期内程序启动略慢',
    paths: (env) => [(env.SystemDrive ?? 'C:') + '\\Windows\\Prefetch'],
    safety: 'caution'
  },
  {
    id: 'thumbnails',
    name: '缩略图缓存',
    desc: 'Explorer 缩略图缓存（thumbcache），删除后自动重建',
    paths: (env) => [
      path.join(env.LOCALAPPDATA ?? '', 'Microsoft\\Windows\\Explorer')
    ],
    safety: 'safe',
    note: '仅删除 thumbcache / iconcache 文件'
  },
  {
    id: 'chrome-cache',
    name: 'Chrome 浏览器缓存',
    desc: 'Chrome 的 Cache / Code Cache（不影响密码、书签）',
    paths: (env) => [
      path.join(env.LOCALAPPDATA ?? '', 'Google\\Chrome\\User Data\\Default\\Cache'),
      path.join(env.LOCALAPPDATA ?? '', 'Google\\Chrome\\User Data\\Default\\Code Cache')
    ],
    safety: 'safe',
    note: '浏览器运行时部分文件会跳过'
  },
  {
    id: 'edge-cache',
    name: 'Edge 浏览器缓存',
    desc: 'Microsoft Edge 的 Cache / Code Cache（不影响收藏、密码）',
    paths: (env) => [
      path.join(env.LOCALAPPDATA ?? '', 'Microsoft\\Edge\\User Data\\Default\\Cache'),
      path.join(env.LOCALAPPDATA ?? '', 'Microsoft\\Edge\\User Data\\Default\\Code Cache')
    ],
    safety: 'safe',
    note: '浏览器运行时部分文件会跳过'
  },
  {
    id: 'recyclebin',
    name: '回收站',
    desc: '所有分区回收站中的内容',
    paths: () => [],
    special: 'recyclebin',
    safety: 'caution',
    note: '清空后无法从回收站还原'
  },
  {
    id: 'windows-update-cache',
    name: 'Windows 更新下载缓存',
    desc: 'SoftwareDistribution\\Download 中已下载的更新包',
    paths: (env) => [(env.SystemDrive ?? 'C:') + '\\Windows\\SoftwareDistribution\\Download'],
    safety: 'caution',
    note: '建议先关闭 Windows 更新服务再清理'
  },
  {
    id: 'crash-dumps',
    name: '崩溃转储文件',
    desc: 'WER 报告队列与 LocalCrashDumps',
    paths: (env) => [
      path.join(env.LOCALAPPDATA ?? '', 'Microsoft\\Windows\\WER\\ReportQueue'),
      path.join(env.LOCALAPPDATA ?? '', 'Microsoft\\Windows\\WER\\ReportArchive'),
      path.join(env.LOCALAPPDATA ?? '', 'CrashDumps')
    ],
    safety: 'safe'
  },
  {
    id: 'dxcache',
    name: '着色器缓存',
    desc: 'DirectX 着色器磁盘缓存（D3DSCache），删除后自动重建',
    paths: (env) => [path.join(env.LOCALAPPDATA ?? '', 'D3DSCache')],
    safety: 'safe'
  }
]

function dirMatchesJunkFilter(dir: string, id: string): (name: string) => boolean {
  if (id === 'thumbnails') {
    return (name) => /^thumbcache_|^iconcache_/i.test(name)
  }
  return () => true
}

async function walkSize(root: string, filter: (name: string) => boolean): Promise<{ bytes: number; files: number; errors: number }> {
  let bytes = 0
  let files = 0
  let errors = 0
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let dirents
    try {
      dirents = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      errors++
      continue
    }
    for (const d of dirents) {
      const full = path.join(dir, d.name)
      if (d.isDirectory()) {
        stack.push(full)
        continue
      }
      if (d.isSymbolicLink()) continue
      if (!filter(d.name)) continue
      try {
        const st = await fsp.stat(full)
        bytes += st.size
        files++
      } catch {
        errors++
      }
    }
  }
  return { bytes, files, errors }
}

export async function listJunkCategories(): Promise<JunkCategory[]> {
  const env = process.env
  const out: JunkCategory[] = []
  for (const def of DEFS) {
    const paths = def.paths(env).filter(Boolean)
    let exists = def.special === 'recyclebin'
    if (!def.special) {
      for (const p of paths) {
        try {
          const st = await fsp.stat(p)
          if (st.isDirectory()) {
            exists = true
            break
          }
        } catch {
          /* 不存在 */
        }
      }
    }
    out.push({
      id: def.id,
      name: def.name,
      desc: def.desc + (def.note ? `（${def.note}）` : ''),
      paths,
      special: def.special,
      safety: def.safety,
      exists
    })
  }
  return out
}

export async function estimateJunk(id: string): Promise<JunkEstimate> {
  const def = DEFS.find((d) => d.id === id)
  if (!def) return { id, bytes: 0, files: 0, errors: 0 }
  if (def.special === 'recyclebin') {
    return { id, bytes: 0, files: 0, errors: 0 } // 大小由渲染端跳过显示（回收站直接清空）
  }
  const env = process.env
  const filter = dirMatchesJunkFilter('', def.id)
  let bytes = 0
  let files = 0
  let errors = 0
  for (const root of def.paths(env).filter(Boolean)) {
    const r = await walkSize(root, filter)
    bytes += r.bytes
    files += r.files
    errors += r.errors
  }
  return { id, bytes, files, errors }
}

/** 清理：直接删除匹配文件（不进回收站——回收站条目特殊处理） */
export async function cleanJunk(id: string): Promise<JunkCleanResult> {
  const def = DEFS.find((d) => d.id === id)
  if (!def) return { id, freed: 0, errors: 1 }
  let freed = 0
  let errors = 0

  if (def.special === 'recyclebin') {
    // 用 PowerShell Clear-RecycleBin
    const { execFile } = await import('node:child_process')
    await new Promise<void>((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue'],
        { timeout: 60000, windowsHide: true },
        () => resolve()
      )
    })
    return { id, freed: -1, errors: 0 } // -1 表示未知大小
  }

  const env = process.env
  const filter = dirMatchesJunkFilter('', def.id)
  for (const root of def.paths(env).filter(Boolean)) {
    let dirents
    try {
      dirents = await fsp.readdir(root, { withFileTypes: true })
    } catch {
      errors++
      continue
    }
    for (const d of dirents) {
      if (!filter(d.name)) continue
      const full = path.join(root, d.name)
      try {
        const st = await fsp.lstat(full)
        if (st.isDirectory()) {
          const r = await walkSize(full, () => true)
          freed += r.bytes
          await fsp.rm(full, { recursive: true, force: true, maxRetries: 1 })
        } else {
          freed += st.size
          await fsp.unlink(full)
        }
      } catch {
        errors++
      }
    }
  }
  return { id, freed, errors }
}
