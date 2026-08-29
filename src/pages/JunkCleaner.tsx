import { useEffect, useState } from 'react'
import { App as AntApp, Alert, Button, Card, Checkbox, Empty, Space, Statistic, Table, Tag, Typography } from 'antd'
import { ClearOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons'
import type { JunkCategory, JunkEstimate } from '../../shared/types'
import { formatBytes } from '../../shared/utils'
import { api } from '../api'

export default function JunkCleaner(): React.ReactElement {
  const { message, modal } = AntApp.useApp()
  const [cats, setCats] = useState<JunkCategory[] | null>(null)
  const [est, setEst] = useState<Record<string, JunkEstimate>>({})
  const [estimating, setEstimating] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [log, setLog] = useState<string[]>([])

  const load = (): void => {
    api
      .junkList()
      .then((list) => {
        setCats(list)
        setChecked(new Set(list.filter((c) => c.safety === 'safe' && c.exists).map((c) => c.id)))
      })
      .catch((e) => void message.error(String(e)))
  }

  useEffect(load, [])

  const estimateAll = async (): Promise<void> => {
    if (!cats) return
    setEstimating(true)
    try {
      for (const c of cats.filter((x) => x.exists)) {
        const e = await api.junkEstimate(c.id)
        setEst((prev) => ({ ...prev, [c.id]: e }))
      }
      void message.success('估算完成')
    } finally {
      setEstimating(false)
    }
  }

  const totalFreed = Object.entries(est)
    .filter(([id]) => checked.has(id))
    .reduce((a, [, e]) => a + Math.max(e.bytes, 0), 0)

  const clean = (): void => {
    if (checked.size === 0 || !cats) return
    const names = cats.filter((c) => checked.has(c.id)).map((c) => c.name).join('、')
    modal.confirm({
      title: '开始清理？',
      content: (
        <div>
          <p>将清理：{names}</p>
          <p style={{ color: '#faad14' }}>
            清理直接删除（不进回收站）。浏览器缓存/缩略图等会自动重建，回收站内容清空后无法还原。
          </p>
        </div>
      ),
      okText: '开始清理',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setCleaning(true)
        const lines: string[] = [`[${new Date().toLocaleTimeString()}] 开始清理 ${checked.size} 类垃圾`]
        setLog((l) => [lines[0], ...l])
        try {
          for (const id of checked) {
            const cat = cats.find((c) => c.id === id)
            try {
              const r = await api.junkClean(id)
              const line =
                r.freed < 0
                  ? `[${new Date().toLocaleTimeString()}] ${cat?.name}：已清空（大小未知）`
                  : `[${new Date().toLocaleTimeString()}] ${cat?.name}：释放 ${formatBytes(r.freed)}${r.errors ? `，${r.errors} 项被占用/无权限已跳过` : ''}`
              setLog((l) => [line, ...l])
              setEst((prev) => ({ ...prev, [id]: { id, bytes: 0, files: 0, errors: 0 } }))
            } catch (e) {
              setLog((l) => [`[${new Date().toLocaleTimeString()}] ${cat?.name}：失败 ${String(e)}`, ...l])
            }
          }
          setLog((l) => [`[${new Date().toLocaleTimeString()}] 清理完成`, ...l])
          void message.success('清理完成')
        } finally {
          setCleaning(false)
        }
      }
    })
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">垃圾清理</h1>
          <div className="page-sub">清理系统临时文件、浏览器缓存等常见垃圾位置</div>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>
            刷新
          </Button>
          <Button icon={<ThunderboltOutlined />} loading={estimating} onClick={() => void estimateAll()}>
            全部估算
          </Button>
        </Space>
      </div>

      {cats && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space size={30} wrap>
            <Statistic title="可清理位置" value={cats.filter((c) => c.exists).length} />
            <Statistic title="已勾选" value={checked.size} />
            <Statistic title="预计释放" value={formatBytes(totalFreed)} valueStyle={{ color: '#52c41a' }} />
            <Button
              type="primary"
              danger
              icon={<ClearOutlined />}
              loading={cleaning}
              disabled={checked.size === 0}
              onClick={clean}
            >
              清理所选
            </Button>
          </Space>
        </Card>
      )}

      <Alert
        type="info"
        showIcon
        message="默认仅勾选「安全」项目；「注意」项目可能影响系统性能（如 Prefetch）或需要管理员权限"
        style={{ marginBottom: 12 }}
      />

      {cats === null && <Empty description="加载中…" />}
      {cats && cats.length === 0 && <Empty description="未发现垃圾位置" />}

      {cats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cats.map((c) => {
            const e = est[c.id]
            return (
              <Card key={c.id} size="small" style={{ opacity: c.exists ? 1 : 0.45 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Checkbox
                    checked={checked.has(c.id)}
                    disabled={!c.exists}
                    onChange={(ev) => {
                      const next = new Set(checked)
                      if (ev.target.checked) next.add(c.id)
                      else next.delete(c.id)
                      setChecked(next)
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Space size={8}>
                      <Typography.Text strong>{c.name}</Typography.Text>
                      <Tag color={c.safety === 'safe' ? 'green' : 'orange'}>
                        {c.safety === 'safe' ? '安全' : '注意'}
                      </Tag>
                      {!c.exists && <Tag>未安装/不存在</Tag>}
                    </Space>
                    <div className="page-sub" style={{ margin: 0 }} title={c.paths.join('\n')}>
                      {c.desc}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 140 }}>
                    <div style={{ fontWeight: 600, color: '#52c41a' }}>
                      {e ? (e.bytes >= 0 ? formatBytes(e.bytes) : '未知') : '未估算'}
                    </div>
                    {e && e.files > 0 && (
                      <span className="page-sub">{e.files.toLocaleString()} 个文件</span>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {log.length > 0 && (
        <Card size="small" title="清理日志" style={{ marginTop: 14 }}>
          <div className="mono" style={{ maxHeight: 220, overflow: 'auto', fontSize: 12 }}>
            {log.map((l, i) => (
              <div key={i} style={{ color: 'rgba(255,255,255,0.65)' }}>
                {l}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
