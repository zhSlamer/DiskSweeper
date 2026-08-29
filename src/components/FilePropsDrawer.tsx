import { Drawer, Descriptions, Tag, Button, Space, App as AntApp } from 'antd'
import { FolderOpenOutlined, AimOutlined, CopyOutlined, PlayCircleOutlined } from '@ant-design/icons'
import type { FileRow } from '../../shared/types'
import { formatBytes, formatTime, flagLabels } from '../../shared/utils'
import { CATEGORY_LABELS } from '../../shared/constants'
import { categoryOfExt } from '../../shared/utils'
import { api } from '../api'

/** 直接运行有风险的扩展名（打开前需确认） */
const EXECUTABLE_EXTS = new Set([
  'exe', 'msi', 'msix', 'appx', 'bat', 'cmd', 'com', 'scr',
  'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'ps1', 'psm1', 'reg'
])

export default function FilePropsDrawer({
  row,
  onClose
}: {
  row: FileRow | null
  onClose: () => void
}): React.ReactElement {
  const { message, modal } = AntApp.useApp()
  if (!row) return <Drawer open={false} onClose={onClose} />

  const cat = CATEGORY_LABELS[categoryOfExt(row.ext)]
  const flags = flagLabels(row.f, row.n.startsWith('.'))
  const isExecutable = EXECUTABLE_EXTS.has(row.ext)

  /** 打开所在文件夹（资源管理器中定位） */
  const reveal = (): void => {
    void api.reveal(row.p)
  }

  /** 打开文件本身；可执行文件先确认 */
  const open = (): void => {
    if (isExecutable) {
      modal.confirm({
        title: '运行此程序？',
        content: `"${row.n}" 是可执行文件，点击确定将直接运行它。若只是想查看它所在的位置，请使用"打开所在位置"。`,
        okText: '仍要运行',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => {
          void api.open(row.p)
        }
      })
      return
    }
    void api.open(row.p)
  }

  return (
    <Drawer
      open={!!row}
      onClose={onClose}
      title={row.n}
      width={430}
      extra={
        <Space>
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={() => {
              void api.copyPath(row.p)
              void message.success('路径已复制')
            }}
          >
            复制路径
          </Button>
        </Space>
      }
    >
      <div className="mono" style={{ wordBreak: 'break-all', marginBottom: 14, color: 'rgba(255,255,255,0.55)' }}>
        {row.p}
      </div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" icon={<AimOutlined />} onClick={reveal}>
          打开所在位置
        </Button>
        {!row.dir && (
          <Button icon={<PlayCircleOutlined />} onClick={open}>
            打开文件
          </Button>
        )}
      </Space>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="类型">{row.dir ? '文件夹' : cat}</Descriptions.Item>
        <Descriptions.Item label="实际大小">
          {row.dir ? '-' : `${formatBytes(row.s)} （${row.s.toLocaleString()} 字节）`}
        </Descriptions.Item>
        {!row.dir && (
          <Descriptions.Item label="磁盘占用">{formatBytes(row.sd)}</Descriptions.Item>
        )}
        <Descriptions.Item label="修改时间">{formatTime(row.mt)}</Descriptions.Item>
        {row.ct > 0 && <Descriptions.Item label="创建时间">{formatTime(row.ct)}</Descriptions.Item>}
        {row.at > 0 && <Descriptions.Item label="访问时间">{formatTime(row.at)}</Descriptions.Item>}
        {row.ext && <Descriptions.Item label="扩展名">.{row.ext}</Descriptions.Item>}
        {flags.length > 0 && (
          <Descriptions.Item label="属性">
            <Space size={4} wrap>
              {flags.map((f) => (
                <Tag key={f} color="orange">
                  {f}
                </Tag>
              ))}
            </Space>
          </Descriptions.Item>
        )}
      </Descriptions>
    </Drawer>
  )
}
