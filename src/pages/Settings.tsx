import { useEffect, useState } from 'react'
import { App as AntApp, Button, Card, Empty, Form, Input, Select, Space, Typography, Tag } from 'antd'
import type { DeleteMode } from '../../shared/types'
import { DEFAULT_EXCLUDES } from '../../shared/constants'
import { useApp } from '../stores/app'

export default function Settings(): React.ReactElement {
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const { message } = AntApp.useApp()
  const [excludeText, setExcludeText] = useState('')

  useEffect(() => {
    if (settings) setExcludeText(settings.excludes.join('\n'))
  }, [settings])

  if (!settings) {
    return (
      <div className="page">
        <Empty description="加载中…" />
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="page-title">设置</h1>
      <div className="page-sub">配置会立即保存</div>

      <Card size="small" title="默认删除方式" style={{ marginBottom: 12 }}>
        <Form layout="vertical">
          <Form.Item style={{ marginBottom: 0 }}>
            <Select
              value={settings.defaultDeleteMode}
              style={{ width: 320 }}
              onChange={(v) => void updateSettings({ defaultDeleteMode: v as DeleteMode })}
              options={[
                { value: 'recycle', label: '移入回收站（推荐，可还原）' },
                { value: 'quarantine', label: '移入隔离区（应用内保存，可恢复）' },
                { value: 'permanent', label: '永久删除（不进回收站）' }
              ]}
            />
          </Form.Item>
        </Form>
      </Card>

      <Card size="small" title="扫描排除目录" style={{ marginBottom: 12 }}>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          每行一条。仅写目录名（如 System Volume Information）匹配任意层级；写完整路径（如 C:\Windows）则只排除该路径。
        </Typography.Paragraph>
        <Input.TextArea
          rows={6}
          value={excludeText}
          onChange={(e) => setExcludeText(e.target.value)}
          onBlur={() => {
            const list = excludeText
              .split('\n')
              .map((x) => x.trim())
              .filter(Boolean)
            void updateSettings({ excludes: list })
            void message.success('排除列表已保存')
          }}
        />
        <Space style={{ marginTop: 8 }}>
          <Button
            size="small"
            onClick={() => setExcludeText(DEFAULT_EXCLUDES.join('\n'))}
          >
            恢复默认
          </Button>
        </Space>
      </Card>

      <Card size="small" title="安全" style={{ marginBottom: 12 }}>
        <Space direction="vertical">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>系统关键目录二次确认</span>
            <Tag color={settings.confirmProtected ? 'green' : 'red'}>
              {settings.confirmProtected ? '已开启' : '已关闭（危险）'}
            </Tag>
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            对 Windows、Program Files、ProgramData 等目录内容执行永久删除/粉碎时，始终弹出高风险确认。
          </Typography.Text>
        </Space>
      </Card>

      <Card size="small" title="关于">
        <Space direction="vertical" size={2}>
          <Typography.Text>磁盘清理专家 DiskSweeper v{APP_VERSION}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            数据均在本机处理，不上传任何信息。删除默认进入系统回收站。
          </Typography.Text>
        </Space>
      </Card>
    </div>
  )
}

const APP_VERSION = '1.0.0'
