# 磁盘清理专家 DiskSweeper

<p align="center">
  <b>一款现代化的 Windows 文件筛选与磁盘清理桌面工具</b><br/>
  Electron · React 18 · TypeScript · Ant Design 5 · ECharts
</p>

---

## ✨ 项目简介

DiskSweeper（磁盘清理专家）是一款运行在 Windows 上的开源桌面应用，帮助你**看清磁盘空间去向、精准筛选目标文件、安全批量清理**。它整合了多款经典开源工具的核心能力：

| 借鉴对象 | 吸收的能力 |
|---|---|
| [WinDirStat](https://windirstat.net/) | 目录树 + 矩形树图的空间可视化 |
| [BleachBit](https://www.bleachbit.org/) | 系统垃圾位置清单与安全清理 |
| [dupeGuru](https://dupeguru.voltaicideas.net/) | 重复文件智能保留策略 |
| [Czkawka](https://github.com/qarmin/czkawka) | 三级哈希查重、多线程扫描、缓存思路 |

所有数据均在本机处理，**不上传任何信息**。

## 🖼️ 界面预览

### 仪表盘
所有磁盘分区使用总览，一键直达各功能模块。

![仪表盘](docs/screenshots/01-dashboard.png)

### 空间分析
多线程扫描任意目录/磁盘，矩形树图点击下钻、按扩展名的类型分布饼图、目录树、大文件 Top 榜；点击任意文件可查看完整属性（实际大小/磁盘占用、创建/修改/访问时间、只读/隐藏/系统属性等）并支持在资源管理器中定位。

![空间分析](docs/screenshots/02-analyzer.png)

### 智能筛选
15 种一键预设（大文件、N 年未访问、空文件、空文件夹、临时/残留文件、视频/音频/图片/压缩包/安装包/文档/日志/代码等），也可自由组合条件：大小范围、扩展名、时间字段与天数、文件名（包含/通配符/正则）、文件属性。结果支持排序、批量操作（回收站 / 隔离 / 移动 / 永久删除 / 粉碎）与 CSV / JSON 导出。

![智能筛选](docs/screenshots/03-filter.png)

### 重复文件查找
三级检测流水线：**按大小分组 → 头 64KB 部分哈希 → 全量 SHA-256**，快速且准确。支持"保留最新/最旧/第一个"的智能勾选，每组硬性保证至少保留一份。

![重复文件](docs/screenshots/04-duplicates.png)

### 垃圾清理
内置 10 类常见垃圾位置：用户/系统临时文件、Prefetch 预读、缩略图缓存、Chrome / Edge 浏览器缓存、回收站、Windows 更新下载缓存、崩溃转储、DirectX 着色器缓存。逐项估算占用、标注安全等级、输出清理日志。

![垃圾清理](docs/screenshots/05-junk.png)

### 安全中心
所有删除 / 移动 / 隔离操作均有完整记录；"隔离"模式把不确定的文件移入应用隔离区，随时可一键恢复原位。

![安全中心](docs/screenshots/06-history.png)

### 设置
默认删除方式、扫描排除目录（支持目录名与完整路径两种写法）、系统关键目录二次确认开关。

![设置](docs/screenshots/07-settings.png)

## 🚀 快速开始

### 环境要求

- **Node.js ≥ 18**（推荐 20+，本项目在 Node 24 上开发验证）
- **npm ≥ 9**
- Windows 10 / 11（垃圾清理、回收站、盘符检测等能力依赖 Windows）

### 方式一：下载安装包（推荐普通用户）

从 [Releases](https://github.com/zhSlamer/DiskSweeper/releases) 页面下载：

- `DiskSweeper-x.x.x-setup.exe` —— 安装版，双击安装
- `DiskSweeper-x.x.x-portable.exe` —— 便携版，免安装直接运行

### 方式二：从源码运行（开发者）

```bash
# 1. 克隆仓库
git clone https://github.com/zhSlamer/DiskSweeper.git
cd DiskSweeper

# 2. 安装依赖（首次会自动下载 Electron 二进制，约 1-2 分钟）
npm install

# 3. 启动开发模式（支持热更新）
npm run dev
```

### 方式三：本地打包

```bash
# 类型检查 + 构建 + 打包（产物在 dist/ 目录）
npm run dist
# 生成：dist/DiskSweeper-1.0.0-setup.exe 与 dist/DiskSweeper-1.0.0-portable.exe
```

## 📜 可用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发模式运行（electron-vite dev，热更新） |
| `npm run typecheck` | 主进程 + 渲染进程 TypeScript 类型检查 |
| `npm run build` | 类型检查并构建产物到 `out/` |
| `npm run dist` | 构建并打包为 Windows 安装包 + 便携版 |
| `npm run fixtures` | 在 `.testfix/` 生成测试目录（大文件/重复文件/空文件/临时文件等，用于自测） |

## 🏗️ 项目结构

```
DiskSweeper/
├─ electron/                  # 主进程
│  ├─ main.ts                 # 应用入口、窗口创建
│  ├─ ipc.ts                  # IPC 通道注册（前后端唯一桥梁）
│  ├─ preload/
│  │  └─ index.ts             # contextBridge 暴露安全 API
│  ├─ workers/
│  │  ├─ scanWorker.ts        # 扫描 worker：目录展开、文件属性收集
│  │  └─ hashWorker.ts        # 哈希 worker：部分/全量 SHA-256
│  └─ services/
│     ├─ scanner.ts           # 扫描引擎（线程池、目录聚合、树图数据）
│     ├─ filterEngine.ts      # 筛选引擎（预设/自定义条件、导出）
│     ├─ duplicates.ts        # 重复文件三级检测流水线
│     ├─ junk.ts              # Windows 垃圾位置清单、估算与清理
│     ├─ fileOps.ts           # 删除/移动/隔离/粉碎（回收站走 Shell COM）
│     ├─ drives.ts            # 磁盘分区列表（PowerShell + statfs 双通道）
│     ├─ history.ts           # 操作历史（JSONL 追加存储）
│     └─ settings.ts          # 用户设置持久化
├─ src/                       # 渲染进程（React）
│  ├─ App.tsx                 # 侧边栏导航外壳
│  ├─ pages/                  # 7 个页面
│  │  ├─ Dashboard.tsx        # 仪表盘
│  │  ├─ Analyzer.tsx         # 空间分析
│  │  ├─ SmartFilter.tsx      # 智能筛选
│  │  ├─ Duplicates.tsx       # 重复文件
│  │  ├─ JunkCleaner.tsx      # 垃圾清理
│  │  ├─ History.tsx          # 安全中心
│  │  └─ Settings.tsx         # 设置
│  ├─ components/             # 树图/饼图/文件属性抽屉等
│  └─ stores/                 # Zustand 全局状态
├─ shared/                    # 主/渲染进程共享：类型定义、IPC 通道名、常量与工具
├─ scripts/                   # 测试数据生成、截图脚本
├─ docs/screenshots/          # 界面截图
└─ electron.vite.config.ts    # 构建配置
```

## 🔧 技术要点

- **扫描性能**：主进程维护 worker 线程池（默认 `min(CPU核数, 8)` 个），目录展开并行执行；worker 意外退出时自动重新排队在途目录并补充线程，扫描不中断、进度不卡死
- **大目录友好**：树图按字节预算裁剪节点、文件表格分页 + 排序下推到主进程、Top 榜排序结果缓存
- **删除安全**：
  - 默认删除到**系统回收站**（通过 Windows Shell COM `InvokeVerb('delete')`，可随时还原）
  - "隔离"模式把文件移入应用数据目录并记录原路径，支持一键恢复
  - "永久删除 / 粉碎"对 `Windows`、`Program Files` 等系统关键路径强制高风险二次确认
  - 粉碎 = 先以 0x00 / 0xFF 覆写两遍再删除
- **进程隔离**：`contextIsolation` 开启、`nodeIntegration` 关闭，渲染进程仅能调用 preload 白名单 IPC；未捕获错误经 `console-message` 转发到终端便于诊断
- **垃圾清理**：只按白名单位置与文件名模式（如 `thumbcache_*`）删除，浏览器缓存不动密码与书签；被占用/无权限文件自动跳过并计数

## ❓ 常见问题

**Q：扫描整个 C 盘很慢 / 大量"无法访问"？**
系统目录与其它用户的文件没有读取权限，应用会自动跳过并计入"无法访问"数量，不影响其余部分。建议优先扫描具体目录。

**Q：删除的文件去哪了？**
默认进入系统回收站；可在设置中修改默认行为，或在操作时选择隔离 / 永久删除 / 粉碎。

**Q：垃圾清理需要管理员权限吗？**
用户级垃圾（%TEMP%、浏览器缓存、缩略图等）不需要；`Windows\Temp`、更新缓存等系统位置无权限的文件会被自动跳过。

**Q：会收集我的数据吗？**
不会。所有扫描、哈希、清理均在本地完成；操作历史仅保存在本机应用数据目录。

## 🛣️ Roadmap

- [ ] 文件名/内容全文搜索
- [ ] 空间快照对比（两次扫描 diff，找出新增大文件）
- [ ] 相似图片检测（感知哈希）
- [ ] 多语言（英文界面）
- [ ] 自动更新（electron-updater）

## 📄 许可证

[MIT](LICENSE) © zhSlamer
