import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Breadcrumb,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Progress,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Typography
} from 'antd'
import { FolderOpenOutlined, SearchOutlined, StopOutlined, FileOutlined, FolderOutlined, AimOutlined } from '@ant-design/icons'
import type { ExtStat, FileRow, TreeChild, TreeMapNode } from '../../shared/types'
import { formatBytes, formatTime, extLabel } from '../../shared/utils'
import { CATEGORY_COLORS, categoryOfExt } from '../../shared/constants'
import { api } from '../api'
import { useApp } from '../stores/app'
import FilePropsDrawer from '../components/FilePropsDrawer'
import TreeMapChart from '../components/TreeMapChart'
import PieChart from '../components/PieChart'

interface TreeNode {
  title: React.ReactNode
  key: string
  bytes: number
  files: number
  isLeaf?: boolean
  children?: TreeNode[]
}

export default function Analyzer(): React.ReactElement {
  const { message, modal } = AntApp.useApp()
  const running = useApp((s) => s.running)
  const progress = useApp((s) => s.progress)
  const summary = useApp((s) => s.summary)
  const scanId = useApp((s) => s.scanId)
  const beginScan = useApp((s) => s.beginScan)
  const cancel = useApp((s) => s.cancel)

  const [root, setRoot] = useState('')
  const [propsRow, setPropsRow] = useState<FileRow | null>(null)
  const [curDir, setCurDir] = useState('')

  // 每次拿到扫描结果重置当前目录
  useEffect(() => {
    if (scanId && summary) setCurDir(summary.root)
  }, [scanId, summary])

  // 仪表盘快捷入口预填盘符
  useEffect(() => {
    const h = (e: Event): void => {
      const detail = (e as CustomEvent).detail as string
      setRoot(detail)
      void beginScan(detail).catch((err) => void message.error(String(err)))
    }
    window.addEventListener('ds:analyze-drive', h)
    return () => window.removeEventListener('ds:analyze-drive', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const browse = async (): Promise<void> => {
    const dir = await api.openDirDialog(root || undefined)
    if (dir) setRoot(dir)
  }

  const start = (): void => {
    if (!root.trim()) {
      void message.warning('请先选择或输入要分析的目录')
      return
    }
    beginScan(root.trim()).catch((e) => void message.error(String(e instanceof Error ? e.message : e)))
  }

  const pct = useMemo(() => {
    if (!progress) return null
    return progress
  }, [progress])

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      <h1 className="page-title">空间分析</h1>
      <div className="page-sub">扫描目录后查看空间分布：目录树、矩形树图、类型分布与大文件排行</div>

      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <Input
          placeholder="选择或输入目录，如 C:\Users"
          value={root}
          onChange={(e) => setRoot(e.target.value)}
          onPressEnter={start}
          disabled={running}
        />
        <Button onClick={() => void browse()} disabled={running}>
          浏览…
        </Button>
        {running ? (
          <Button danger icon={<StopOutlined />} onClick={() => void cancel()}>
            取消扫描
          </Button>
        ) : (
          <Button type="primary" icon={<SearchOutlined />} onClick={start}>
            开始扫描
          </Button>
        )}
      </Space.Compact>

      {running && pct && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Spin />
            <div style={{ flex: 1 }}>
              <Progress
                percent={Math.min(99, pct.files / 2000)}
                showInfo={false}
                size="small"
                status="active"
              />
              <div className="page-sub" style={{ margin: 0 }}>
                已发现 {pct.files.toLocaleString()} 个文件 · {pct.dirs.toLocaleString()} 个目录 ·{' '}
                {formatBytes(pct.bytes)} · {(pct.elapsedMs / 1000).toFixed(1)}s
                {pct.errors > 0 ? ` · ${pct.errors} 项无法访问` : ''}
              </div>
              <div className="mono ellipsis-cell" style={{ direction: 'ltr', color: 'rgba(255,255,255,0.35)' }}>
                <span>{pct.current}</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {summary && summary.cancelled && (
        <Alert type="warning" showIcon message="扫描已取消，结果不完整" style={{ marginBottom: 12 }} />
      )}

      {!scanId && !running && (
        <Empty
          style={{ marginTop: 80 }}
          description={
            <span>
              选择磁盘或文件夹开始扫描
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                提示：直接扫描整个盘（如 C:\）耗时较长，建议先扫具体目录
              </Typography.Text>
            </span>
          }
        />
      )}

      {scanId && summary && (
        <>
          <Card size="small" style={{ marginBottom: 12 }}>
            <Space size={40} wrap>
              <Statistic title="根目录" value={summary.root} valueStyle={{ fontSize: 13 }} />
              <Statistic title="文件" value={summary.files.toLocaleString()} />
              <Statistic title="文件夹" value={summary.dirs.toLocaleString()} />
              <Statistic title="总大小" value={formatBytes(summary.bytes)} />
              <Statistic title="耗时" value={(summary.elapsedMs / 1000).toFixed(1) + 's'} />
              {summary.errors > 0 && (
                <Statistic title="无法访问" value={summary.errors} valueStyle={{ color: '#faad14' }} />
              )}
            </Space>
          </Card>

          <Tabs
            items={[
              {
                key: 'treemap',
                label: '空间分布',
                children: (
                  <Row gutter={12}>
                    <Col span={15}>
                      <Card size="small" title="矩形树图（点击下钻）">
                        <TreemapPanel scanId={scanId} curDir={curDir} setCurDir={setCurDir} root={summary.root} />
                      </Card>
                    </Col>
                    <Col span={9}>
                      <Card size="small" title="类型分布（按扩展名）">
                        <ExtPie scanId={scanId} />
                      </Card>
                    </Col>
                  </Row>
                )
              },
              {
                key: 'tree',
                label: '目录树',
                children: (
                  <Card size="small">
                    <DirTree scanId={scanId} root={summary.root} curDir={curDir} onPick={setCurDir} />
                  </Card>
                )
              },
              {
                key: 'top',
                label: '大文件 Top 200',
                children: (
                  <Card size="small">
                    <TopFiles scanId={scanId} onProps={setPropsRow} />
                  </Card>
                )
              }
            ]}
          />
        </>
      )}

      <FilePropsDrawer row={propsRow} onClose={() => setPropsRow(null)} />
    </div>
  )
}

function TreemapPanel({
  scanId,
  curDir,
  setCurDir,
  root
}: {
  scanId: number
  curDir: string
  setCurDir: (d: string) => void
  root: string
}): React.ReactElement {
  const [nodes, setNodes] = useState<TreeMapNode[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api
      .treemap(scanId, curDir, 2)
      .then(setNodes)
      .finally(() => setLoading(false))
  }, [scanId, curDir])

  const crumbs = useMemo(() => {
    const parts: { label: string; path: string }[] = [{ label: root, path: root }]
    if (curDir !== root && curDir.startsWith(root)) {
      const rel = curDir.slice(root.length).replace(/^[\\/]+/, '')
      let acc = root
      for (const seg of rel.split(/[\\/]+/).filter(Boolean)) {
        acc = acc.endsWith('\\') ? acc + seg : acc + '\\' + seg
        parts.push({ label: seg, path: acc })
      }
    }
    return parts
  }, [curDir, root])

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Breadcrumb
          items={crumbs.map((c) => ({
            title: <a onClick={() => setCurDir(c.path)}>{c.label}</a>
          }))}
        />
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin />
        </div>
      ) : nodes.length === 0 ? (
        <Empty description="该目录没有子目录" />
      ) : (
        <TreeMapChart
          data={nodes}
          height={360}
          onClick={(p) => setCurDir(p)}
        />
      )}
      <div className="page-sub" style={{ margin: '6px 0 0' }}>
        点击色块进入子目录；颜色深浅代表占用比例
      </div>
    </div>
  )
}

function ExtPie({ scanId }: { scanId: number }): React.ReactElement {
  const [stats, setStats] = useState<ExtStat[]>([])
  useEffect(() => {
    api.extStats(scanId, 12).then(setStats)
  }, [scanId])

  const data = stats.map((s) => ({
    name: extLabel(s.ext),
    value: s.bytes,
    count: s.count,
    itemStyle: { color: CATEGORY_COLORS[categoryOfExt(s.ext)] }
  }))
  const total = stats.reduce((a, b) => a + b.bytes, 0)

  return (
    <>
      <PieChart data={data} height={300} />
      <div className="page-sub" style={{ margin: 0 }}>
        共统计 {formatBytes(total)}
      </div>
    </>
  )
}

function DirTree({
  scanId,
  root,
  curDir,
  onPick
}: {
  scanId: number
  root: string
  curDir: string
  onPick: (d: string) => void
}): React.ReactElement {
  const [items, setItems] = useState<TreeChild[]>([])
  const [loading, setLoading] = useState(false)
  const [path, setPath] = useState(root)
  const [historyBack, setHistoryBack] = useState<string[]>([])

  useEffect(() => {
    setPath(root)
    setHistoryBack([])
  }, [root])

  const load = useCallback(
    (dir: string) => {
      setLoading(true)
      api
        .treeChildren(scanId, dir)
        .then(setItems)
        .finally(() => setLoading(false))
    },
    [scanId]
  )

  useEffect(() => {
    load(path)
  }, [load, path])

  return (
    <>
      <Space style={{ marginBottom: 10 }}>
        <Button
          size="small"
          disabled={historyBack.length === 0}
          onClick={() => {
            const prev = historyBack[historyBack.length - 1]
            setHistoryBack((h) => h.slice(0, -1))
            setPath(prev)
          }}
        >
          上一级
        </Button>
        <Typography.Text code className="mono">
          {path}
        </Typography.Text>
      </Space>
      <Table<TreeNode>
        size="small"
        loading={loading}
        rowKey="key"
        dataSource={items.map((c) => ({
          title: c.name,
          key: c.path,
          bytes: c.bytes,
          files: c.files
        }))}
        columns={[
          {
            title: '目录',
            dataIndex: 'title',
            render: (v: string, r) => (
              <a onClick={() => { setHistoryBack((h) => [...h, path]); setPath(r.key) }}>
                <FolderOutlined style={{ color: '#faad14', marginRight: 6 }} />
                {v}
              </a>
            )
          },
          { title: '大小', dataIndex: 'bytes', width: 120, render: (v: number) => formatBytes(v), defaultSortOrder: 'descend', sorter: (a, b) => a.bytes - b.bytes },
          { title: '文件数', dataIndex: 'files', width: 110, sorter: (a, b) => a.files - b.files },
          {
            title: '',
            width: 90,
            render: (_v, r) => (
              <a onClick={() => onPick(r.key)}>在分布图中查看</a>
            )
          }
        ]}
        pagination={false}
        scroll={{ y: 340 }}
      />
    </>
  )
}

function TopFiles({ scanId, onProps }: { scanId: number; onProps: (r: FileRow) => void }): React.ReactElement {
  const [rows, setRows] = useState<FileRow[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    api
      .topFiles(scanId, 200)
      .then(setRows)
      .finally(() => setLoading(false))
  }, [scanId])

  return (
    <Table<FileRow>
      size="small"
      loading={loading}
      rowKey="id"
      dataSource={rows}
      onRow={(r) => ({ onClick: () => onProps(r), style: { cursor: 'pointer' } })}
      columns={[
        {
          title: '#',
          width: 50,
          render: (_v, _r, i) => i + 1
        },
        {
          title: '文件',
          dataIndex: 'p',
          ellipsis: { showTitle: false },
          render: (p: string, r) => (
            <span title={p}>
              <FileOutlined style={{ marginRight: 6, color: 'rgba(255,255,255,0.45)' }} />
              {r.n}
            </span>
          )
        },
        {
          title: '所在目录',
          dataIndex: 'p',
          ellipsis: { showTitle: true },
          render: (p: string) => (
            <span className="mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {p.slice(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')))}
            </span>
          )
        },
        { title: '大小', dataIndex: 's', width: 110, render: (v: number) => formatBytes(v), defaultSortOrder: 'descend' },
        { title: '修改时间', dataIndex: 'mt', width: 140, render: (v: number) => formatTime(v) },
        {
          title: '操作',
          width: 64,
          render: (_v: unknown, r: FileRow) => (
            <Button
              type="text"
              size="small"
              icon={<AimOutlined />}
              title="打开所在位置"
              onClick={(e) => {
                e.stopPropagation()
                void api.reveal(r.p)
              }}
            />
          )
        }
      ]}
      pagination={{ pageSize: 50, size: 'small' }}
    />
  )
}
