import { useEffect, useState } from 'react'
import { Card, Col, Progress, Row, Statistic, Button, Empty, Spin, App as AntApp, Tag, Space } from 'antd'
import { PieChartOutlined, FilterOutlined, CopyOutlined, ClearOutlined, ReloadOutlined } from '@ant-design/icons'
import type { DriveInfo, ScanSummary } from '../../shared/types'
import { formatBytes, formatTime } from '../../shared/utils'
import { api } from '../api'
import { useApp } from '../stores/app'

const TYPE_LABEL: Record<DriveInfo['type'], string> = {
  fixed: '本地磁盘',
  removable: '可移动磁盘',
  network: '网络驱动器',
  other: '其他'
}

export default function Dashboard(): React.ReactElement {
  const [drives, setDrives] = useState<DriveInfo[] | null>(null)
  const [loading, setLoading] = useState(false)
  const summary = useApp((s) => s.summary)
  const setPage = useApp((s) => s.setPage)
  const { message } = AntApp.useApp()

  const refresh = (): void => {
    setLoading(true)
    api
      .listDrives()
      .then(setDrives)
      .catch(() => void message.error('获取磁盘信息失败'))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const quick = [
    { key: 'analyzer', icon: <PieChartOutlined />, title: '空间分析', desc: '看看空间都被什么占了' },
    { key: 'filter', icon: <FilterOutlined />, title: '智能筛选', desc: '按条件找出待清理文件' },
    { key: 'duplicates', icon: <CopyOutlined />, title: '重复文件', desc: '找回被重复文件浪费的空间' },
    { key: 'junk', icon: <ClearOutlined />, title: '垃圾清理', desc: '一键清理系统常见垃圾' }
  ] as const

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">仪表盘</h1>
          <div className="page-sub">磁盘使用总览与快捷入口</div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
          刷新
        </Button>
      </div>

      <Row gutter={[14, 14]}>
        {(drives ?? []).map((d) => {
          const used = d.total - d.free
          const pct = d.total > 0 ? Math.round((used / d.total) * 100) : 0
          return (
            <Col key={d.letter} xs={24} sm={12} lg={8} xl={6}>
              <Card
                size="small"
                hoverable
                onClick={() => {
                  setPage('analyzer')
                  window.dispatchEvent(new CustomEvent('ds:analyze-drive', { detail: d.letter + '\\' }))
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Statistic title={d.letter} value={d.label || TYPE_LABEL[d.type]} valueStyle={{ fontSize: 16 }} />
                  <Tag color={pct > 90 ? 'red' : pct > 75 ? 'orange' : 'green'}>{pct}%</Tag>
                </div>
                <Progress percent={pct} showInfo={false} strokeColor={pct > 90 ? '#ff4d4f' : '#4096ff'} />
                <div className="page-sub" style={{ margin: '6px 0 0', display: 'flex', justifyContent: 'space-between' }}>
                  <span>已用 {formatBytes(used)}</span>
                  <span>剩余 {formatBytes(d.free)}</span>
                </div>
                <div className="page-sub" style={{ margin: '2px 0 0' }}>
                  共 {formatBytes(d.total)} · {TYPE_LABEL[d.type]}
                  {d.fileSystem ? ` · ${d.fileSystem}` : ''}
                </div>
              </Card>
            </Col>
          )
        })}
      </Row>
      {drives && drives.length === 0 && (
        <Empty description="未检测到可用磁盘分区" style={{ marginTop: 60 }} />
      )}
      {drives === null && (
        <div style={{ textAlign: 'center', marginTop: 80 }}>
          <Spin />
        </div>
      )}

      <h2 style={{ fontSize: 15, margin: '26px 0 12px' }}>快捷入口</h2>
      <Row gutter={[14, 14]}>
        {quick.map((q) => (
          <Col key={q.key} xs={12} lg={6}>
            <Card size="small" hoverable onClick={() => setPage(q.key)}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: 'rgba(64,150,255,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    color: '#4096ff'
                  }}
                >
                  {q.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{q.title}</div>
                  <div className="page-sub" style={{ margin: 0 }}>
                    {q.desc}
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {summary && !summary.cancelled && <LastScan summary={summary} />}
    </div>
  )
}

function LastScan({ summary }: { summary: ScanSummary }): React.ReactElement {
  return (
    <Card size="small" style={{ marginTop: 24 }} title="上次扫描">
      <Space size={30} wrap>
        <Statistic title="目录" value={summary.root} valueStyle={{ fontSize: 13 }} />
        <Statistic title="文件数" value={summary.files.toLocaleString()} />
        <Statistic title="文件夹数" value={summary.dirs.toLocaleString()} />
        <Statistic title="总大小" value={formatBytes(summary.bytes)} />
        <Statistic title="耗时" value={(summary.elapsedMs / 1000).toFixed(1) + ' 秒'} />
        {summary.errors > 0 && <Statistic title="无法访问" value={summary.errors} valueStyle={{ color: '#faad14' }} />}
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>{formatTime(summary.startedAt)}</span>
      </Space>
    </Card>
  )
}
