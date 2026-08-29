// 生成测试目录 .testfix：大文件、重复文件、空文件、空文件夹、临时文件、各类扩展名
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.argv[2] ?? '.testfix')
rmSync(ROOT, { recursive: true, force: true })

function randomFile(p, size) {
  const buf = Buffer.alloc(size)
  for (let i = 0; i < size; i++) buf[i] = (i * 7 + p.length) & 0xff
  writeFileSync(p, buf)
}

function copyFile(src, dest) {
  writeFileSync(dest, readFileSync(src))
}

const dirs = [
  'photos/2023',
  'photos/2024',
  'downloads',
  'work/docs',
  'work/videos',
  'empty1/empty2',
  'empty1',
  'tempdir'
]
for (const d of dirs) mkdirSync(path.join(ROOT, d), { recursive: true })

// 大文件（>1MB）：虚拟机镜像、视频
randomFile(path.join(ROOT, 'work/videos/movie.mkv'), 5 * 1024 * 1024)
randomFile(path.join(ROOT, 'downloads/setup.exe'), 2 * 1024 * 1024)
randomFile(path.join(ROOT, 'photos/2024/DSC_0001.jpg'), 800 * 1024)
randomFile(path.join(ROOT, 'work/docs/report.docx'), 300 * 1024)

// 重复文件：同一内容三份
randomFile(path.join(ROOT, 'downloads/big.iso'), 2 * 1024 * 1024)
copyFile(path.join(ROOT, 'downloads/big.iso'), path.join(ROOT, 'work/videos/big-copy.iso'))
copyFile(path.join(ROOT, 'downloads/big.iso'), path.join(ROOT, 'photos/2023/big-again.iso'))
// 小重复
writeFileSync(path.join(ROOT, 'work/docs/notes.txt'), 'hello duplicated content')
writeFileSync(path.join(ROOT, 'downloads/notes-copy.txt'), 'hello duplicated content')

// 空文件
writeFileSync(path.join(ROOT, 'work/docs/empty.txt'), '')
writeFileSync(path.join(ROOT, 'tempdir/empty.log'), '')

// 临时文件
writeFileSync(path.join(ROOT, 'tempdir/old.tmp'), 'x'.repeat(1024))
writeFileSync(path.join(ROOT, 'tempdir/~$word.docx'), 'lock')
writeFileSync(path.join(ROOT, 'downloads/movie.part'), 'x'.repeat(2048))
writeFileSync(path.join(ROOT, 'tempdir/backup.bak'), 'x'.repeat(4096))

// 空文件夹已建：empty1/empty2、empty1（无文件）
// 日志
writeFileSync(path.join(ROOT, 'tempdir/app-2024.log'), 'log'.repeat(500))

// 图片/音频
randomFile(path.join(ROOT, 'photos/2023/sunset.png'), 200 * 1024)
randomFile(path.join(ROOT, 'downloads/song.mp3'), 400 * 1024)

console.log('fixtures ready at', ROOT)
