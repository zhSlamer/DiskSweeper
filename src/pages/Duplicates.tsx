import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  Progress,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography
} from 'antd'
import { SearchOutlined, StopOutlined, FolderOpenOutlined, DeleteOutlined, SafetyCertificateOutlined, ExportOutlined, AimOutlined } from '@ant-design/icons'
import type { DupGroup } from '../../shared/types'
import { formatBytes, formatTime } from '../../shared/utils'
import { isProtectedPath } from '../../shared/constants'
import { api } from '../api'
import { useApp } from '../stores/app'

export default function Duplicates(): React.ReactElement {
  const { message, modal } = AntApp.useApp()
  const settings = useApp((s) => s.settings)
  const [root, setRoot] = useState('')
  const [minSize, setMinSize] = useState(1024 * 1024)
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle')
  const [prog, setProg] = useState<{ stage: string; checked: number; total: number } | null>(null)
  const [groups, setGroups] = useState<DupGroup[]>([])
  const [wasted, setWasted] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [keepPolicy, setKeepPolicy] = useState<'newest' | 'oldest' | 'first'>('newest')

  useEffect(() => {
    const offP = api.onDupProgress((p) => setProg({ stage: p.stage, checked: p.checked, total: p.total }))
    const offD = api.onDupDone((d) => {
      setPhase('done')
      setGroups(d.groups)
      setWasted(d.wastedBytes)
      setElapsed(d.elapsedMs)
      setProg(null)
      setSelected(new Set())
      if (d.error) void message.error(d.error)
    })
    return () => {
      offP()
      offD()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const browse = async (): Promise<void> => {
    const d = await api.openDirDialog(root || undefined)
    if (d) setRoot(d)
  }

  const start = (): void => {
    if (!root.trim()) {
      void message.warning('请先选择要查重的目录')
      return
    }
    setPhase('running')
    setGroups([])
    setProg({ stage: 'size', checked: 0, total: 0 })
    api.dupStart(root.trim(), minSize).catch((e) => {
      setPhase('idle')
      void message.error(String(e instanceof Error ? e.message : e))
    })
  }

  /* ---------- 智能勾选 ---------- */
  const applyKeepPolicy = (): void => {
    const next = new Set<string>()
    for (const g of groups) {
      const items = g.items
      let keepIdx = 0
      if (keepPolicy === 'newest') {
        for (let i = 1; i < items.length; i++) if (items[i].mt > items[keepIdx].mt) keepIdx = i
      } else if (keepPolicy === 'oldest') {
        for (let i = 1; i < items.length; i++) if (items[i].mt < items[keepIdx].mt) keepIdx = i
      } else {
        keepIdx = 0 // 默认保留路径排序中的第一个（列表已按修改时间升序）
      }
      items.forEach((it, i) => {
        if (i !== keepIdx) next.add(selKey(g, i))
      })
    }
    setSelected(next)
    void message.success(`已勾选 ${next.size} 个待删除副本（每组保留一份）`)
  }

  const selKey = (g: DupGroup, i: number): string => g.hash + ':' + i

  const selectedPaths = useMemo(() => {
    const out: string[] = []
    for (const g of groups) {
      g.items.forEach((it, i) => {
        if (selected.has(selKey(g, i))) out.push(it.p)
      })
    }
    return out
  }, [groups, selected])

  const selectedBytes = useMemo(() => {
    let n = 0
    for (const g of groups) {
      g.items.forEach((_it, i) => {
        if (selected.has(selKey(g, i))) n += g.size
      })
    }
    return n
  }, [groups, selected])

  /** 每组至少保留一份的硬性保护 */
  const validateSelection = (): string | null => {
    for (const g of groups) {
      const selCount = g.items.filter((_it, i) => selected.has(selKey(g, i))).length
      if (selCount === g.items.length) {
        return '每组必须至少保留一份文件，不能整组全选：' + g.items[0].n
      }
    }
    return null
  }

  const doDelete = (mode: 'recycle' | 'permanent', paths: string[]): void => {
    if (paths.length === 0) return
    const bad = validateSelection()
    if (bad) {
      void message.error(bad)
      return
    }
    const hasProtected = paths.some((p) => isProtectedPath(p))
    modal.confirm({
      title: mode === 'recycle' ? '删除勾选的重复文件到回收站？' : '永久删除勾选的重复文件？（无法恢复）',
      content: `共 ${paths.length} 个文件，释放 ${formatBytes(selectedBytes)}` + (hasProtected && (settings?.confirmProtected ?? true) ? '（含系统关键路径！）' : ''),
      okText: '确定',
      okButtonProps: { danger: mode === 'permanent' },
      cancelText: '取消',
      onOk: () =>
        api
          .delete(paths, mode, true)
          .then((r) => {
            void message.success(`完成：成功 ${r.ok}，失败 ${r.fail}`)
            setSelected(new Set())
            const removed = new Set(paths)
            setGroups((gs) =>
              gs
                .map((g) => ({ ...g, items: g.items.filter((it) => !removed.has(it.p)) }))
                .filter((g) => g.items.length >= 2)
            )
          })
          .catch((e) => void message.error(String(e)))
    })
  }

  const stageLabel: Record<string, string> = {
    size: '按大小分组',
    partial: '部分哈希（头 64KB）',
    full: '全量 SHA-256',
    done: '完成'
  }

  return (
    <div className="page">
      <h1 className="page-title">重复文件</h1>
      <div className="page-sub">三级检测（大小 → 部分哈希 → 全量 SHA-256），每组至少保留一份</div>

      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <Input
          placeholder="选择要查重的目录"
          value={root}
          onChange={(e) => setRoot(e.target.value)}
          onPressEnter={start}
          disabled={phase === 'running'}
        />
        <Button icon={<FolderOpenOutlined />} disabled={phase === 'running'} onClick={() => void browse()}>
          浏览…
        </Button>
        <Select
          value={minSize}
          style={{ width: 150 }}
          disabled={phase === 'running'}
          onChange={(v) => setMinSize(v)}
          options={[
            { value: 0, label: '不限大小' },
            { value: 100 * 1024, label: '> 100 KB' },
            { value: 1024 * 1024, label: '> 1 MB（推荐）' },
            { value: 10 * 1024 * 1024, label: '> 10 MB' },
            { value: 100 * 1024 * 1024, label: '> 100 MB' }
          ]}
        />
        {phase === 'running' ? (
          <Button danger icon={<StopOutlined />} onClick={() => void api.dupCancel()}>
            取消
          </Button>
        ) : (
          <Button type="primary" icon={<SearchOutlined />} onClick={start}>
            开始查重
          </Button>
        )}
      </Space.Compact>

      {phase === 'running' && prog && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space style={{ width: '100%' }}>
            <Spin />
            <div style={{ flex: 1, minWidth: 400 }}>
              <div style={{ marginBottom: 4 }}>
                阶段：<Tag color="processing">{stageLabel[prog.stage] ?? prog.stage}</Tag>
                {prog.total > 0 && (
                  <span className="page-sub">
                    {prog.checked.toLocaleString()} / {prog.total.toLocaleString()}
                  </span>
                )}
              </div>
              <Progress
                percent={prog.total > 0 ? Math.round((prog.checked / prog.total) * 100) : 30}
                status="active"
                size="small"
              />
            </div>
          </Space>
        </Card>
      )}

      {phase === 'done' && (
        <>
          <Card size="small" style={{ marginBottom: 12 }}>
            <Space size={30} wrap>
              <Statistic title="重复组" value={groups.length} />
              <Statistic title="可释放空间" value={formatBytes(wasted)} valueStyle={{ color: '#52c41a' }} />
              <Statistic title="耗时" value={(elapsed / 1000).toFixed(1) + 's'} />
              {selectedPaths.length > 0 && (
                <Statistic
                  title="已选删除"
                  value={selectedPaths.length}
                  suffix={`约 ${formatBytes(selectedBytes)}`}
                  valueStyle={{ color: '#4096ff' }}
                />
              )}
            </Space>
            <div style={{ marginTop: 10 }}>
              <Space wrap>
                <Select
                  value={keepPolicy}
                  style={{ width: 170 }}
                  onChange={(v) => setKeepPolicy(v)}
                  options={[
                    { value: 'newest', label: '保留最新修改的' },
                    { value: 'oldest', label: '保留最早修改的' },
                    { value: 'first', label: '保留列表第一个' }
                  ]}
                />
                <Button onClick={applyKeepPolicy} disabled={groups.length === 0}>
                  一键智能勾选
                </Button>
                <Button onClick={() => setSelected(new Set())}>清空勾选</Button>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  disabled={selectedPaths.length === 0}
                  onClick={() => doDelete('recycle', selectedPaths)}
                >
                  删除到回收站
                </Button>
                <Button
                  icon={<SafetyCertificateOutlined />}
                  disabled={selectedPaths.length === 0}
                  onClick={() => doDelete('permanent', selectedPaths)}
                >
                  永久删除
                </Button>
              </Space>
            </div>
          </Card>

          {groups.length === 0 && <Empty description="未发现重复文件 🎉" />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.slice(0, 500).map((g) => (
              <DupGroupCard
                key={g.hash}
                group={g}
                selected={selected}
                setSelected={setSelected}
              />
            ))}
            {groups.length > 500 && (
              <Alert type="info" message={`为性能考虑仅显示前 500 组（共 ${groups.length} 组），可用智能勾选处理全部`} />
            )}
          </div>
        </>
      )}

      {phase === 'idle' && (
        <Empty
          style={{ marginTop: 80 }}
          description="选择目录开始查重；建议先用 >1MB 过滤小文件，速度更快"
        />
      )}
    </div>
  )
}

function DupGroupCard({
  group,
  selected,
  setSelected
}: {
  group: DupGroup
  selected: Set<string>
  setSelected: (s: Set<string>) => void
}): React.ReactElement {
  const { message } = AntApp.useApp()
  const keyOf = (i: number): string => group.hash + ':' + i
  const toggle = (i: number, on: boolean): void => {
    const next = new Set(selected)
    if (on) {
      // 保护：不能全组选中
      const others = group.items.filter((_it, j) => j !== i && next.has(keyOf(j))).length
      if (others === group.items.length - 1) {
        void message.warning('每组至少保留一份文件')
        return
      }
      next.add(keyOf(i))
    } else next.delete(keyOf(i))
    setSelected(next)
  }

  return (
    <Card
      size="small"
      title={
        <Space>
          <span>{group.items[0]?.n}</span>
          <Tag>{formatBytes(group.size)}</Tag>
          <Tag color="green">浪费 {formatBytes(group.waste)}</Tag>
          <Tag>{group.items.length} 份</Tag>
        </Space>
      }
    >
      {group.items.map((it, i) => (
        <div
          key={it.p}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 4px',
            borderRadius: 4,
            background: selected.has(keyOf(i)) ? 'rgba(255,77,79,0.08)' : 'transparent'
          }}
        >
          <Checkbox checked={selected.has(keyOf(i))} onChange={(e) => toggle(i, e.target.checked)} />
          <Typography.Text className="mono" style={{ flex: 1, fontSize: 12, wordBreak: 'break-all' }}>
            {it.p}
          </Typography.Text>
          <span className="page-sub" style={{ margin: 0, whiteSpace: 'nowrap' }}>
            {formatTime(it.mt)}
          </span>
          <Button
            type="text"
            size="small"
            icon={<AimOutlined />}
            onClick={() => void api.reveal(it.p)}
          />
        </div>
      ))}
    </Card>
  )
}
