import { useEffect, useState } from 'react'
import { App as AntApp, Button, Card, Empty, Space, Table, Tabs, Tag, Typography, Popconfirm } from 'antd'
import { ReloadOutlined, ClearOutlined, UndoOutlined } from '@ant-design/icons'
import type { HistoryEntry, QuarantineItem } from '../../shared/types'
import { formatBytes, formatTime } from '../../shared/utils'
import { api } from '../api'

export default function History(): React.ReactElement {
  const [ops, setOps] = useState<HistoryEntry[]>([])
  const [quarantine, setQuarantine] = useState<QuarantineItem[]>([])
  const { message } = AntApp.useApp()

  const load = (): void => {
    void api.history().then(setOps)
    void api.quarantineList().then(setQuarantine)
  }

  useEffect(load, [])

  const restore = async (id: string): Promise<void> => {
    const ok = await api.restore(id)
    if (ok) {
      void message.success('已恢复到原位置')
      load()
    } else {
      void message.error('恢复失败（原位置可能已不存在）')
    }
  }

  const actionColor = (a: string): string => {
    if (a.includes('回收站')) return 'blue'
    if (a.includes('粉碎')) return 'red'
    if (a.includes('永久')) return 'red'
    if (a === '隔离') return 'orange'
    if (a === '移动') return 'purple'
    return 'default'
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">安全中心</h1>
          <div className="page-sub">所有删除/移动/隔离操作都会记录在此；隔离的文件可随时恢复</div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
      </div>

      <Tabs
        items={[
          {
            key: 'ops',
            label: `操作记录（${ops.length}）`,
            children: (
              <Card size="small">
                <Space style={{ marginBottom: 10 }}>
                  <Popconfirm title="清空全部操作记录？" onConfirm={() => void api.clearHistory().then(load)}>
                    <Button size="small" icon={<ClearOutlined />}>
                      清空记录
                    </Button>
                  </Popconfirm>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    记录保存在应用数据目录，不会上传
                  </Typography.Text>
                </Space>
                <Table<HistoryEntry>
                  size="small"
                  rowKey={(r) => r.t + r.action + r.count}
                  dataSource={ops}
                  locale={{ emptyText: <Empty description="暂无操作记录" /> }}
                  columns={[
                    { title: '时间', dataIndex: 't', width: 140, render: (v: number) => formatTime(v) },
                    {
                      title: '操作',
                      dataIndex: 'action',
                      width: 130,
                      render: (a: string) => <Tag color={actionColor(a)}>{a}</Tag>
                    },
                    { title: '成功', dataIndex: 'ok', width: 70 },
                    {
                      title: '失败',
                      dataIndex: 'fail',
                      width: 70,
                      render: (v: number) => (v > 0 ? <span style={{ color: '#ff4d4f' }}>{v}</span> : 0)
                    },
                    { title: '数据量', dataIndex: 'bytes', width: 110, render: (v: number) => formatBytes(v) },
                    {
                      title: '失败详情',
                      dataIndex: 'detail',
                      ellipsis: { showTitle: true },
                      render: (d?: string[]) =>
                        d && d.length > 0 ? (
                          <Typography.Text type="secondary" className="mono" style={{ fontSize: 11 }} title={d.join('\n')}>
                            {d.slice(0, 3).join('；')}
                          </Typography.Text>
                        ) : (
                          '-'
                        )
                    }
                  ]}
                  pagination={{ pageSize: 20, size: 'small' }}
                />
              </Card>
            )
          },
          {
            key: 'quarantine',
            label: `隔离区（${quarantine.length}）`,
            children: (
              <Card size="small">
                <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                  隔离 = 把文件移出原位置保存到应用隔离目录，既释放了原目录，又能随时恢复。适合"不确定要不要删"的文件。
                </Typography.Paragraph>
                <Table<QuarantineItem>
                  size="small"
                  rowKey="id"
                  dataSource={quarantine}
                  locale={{ emptyText: <Empty description="隔离区为空" /> }}
                  columns={[
                    {
                      title: '原位置',
                      dataIndex: 'orig',
                      ellipsis: { showTitle: true },
                      render: (p: string) => (
                        <span className="mono" style={{ fontSize: 12 }}>
                          {p || '(未知)'}
                        </span>
                      )
                    },
                    { title: '隔离时间', dataIndex: 't', width: 140, render: (v: number) => formatTime(v) },
                    { title: '大小', dataIndex: 'size', width: 100, render: (v: number) => (v > 0 ? formatBytes(v) : '-') },
                    {
                      title: '操作',
                      width: 120,
                      render: (_v, r) => (
                        <Button size="small" icon={<UndoOutlined />} onClick={() => void restore(r.id)}>
                          恢复
                        </Button>
                      )
                    }
                  ]}
                  pagination={{ pageSize: 20, size: 'small' }}
                />
              </Card>
            )
          }
        ]}
      />
    </div>
  )
}
