import { Drawer, Descriptions, Tag, Button, Space, App as AntApp } from 'antd'
import { FolderOpenOutlined, AimOutlined, CopyOutlined } from '@ant-design/icons'
import type { FileRow } from '../../shared/types'
import { formatBytes, formatTime, flagLabels } from '../../shared/utils'
import { CATEGORY_LABELS } from '../../shared/constants'
import { categoryOfExt } from '../../shared/utils'
import { api } from '../api'

export default function FilePropsDrawer({
  row,
  onClose
}: {
  row: FileRow | null
  onClose: () => void
}): React.ReactElement {
  const { message } = AntApp.useApp()
  if (!row) return <Drawer open={false} onClose={onClose} />

  const cat = CATEGORY_LABELS[categoryOfExt(row.ext)]
  const flags = flagLabels(row.f, row.n.startsWith('.'))

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
            icon={<AimOutlined />}
            onClick={() => void api.reveal(row.p)}
          >
            定位
          </Button>
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
          {!row.dir && (
            <Button size="small" type="primary" icon={<FolderOpenOutlined />} onClick={() => void api.open(row.p)}>
              打开
            </Button>
          )}
        </Space>
      }
    >
      <div className="mono" style={{ wordBreak: 'break-all', marginBottom: 14, color: 'rgba(255,255,255,0.55)' }}>
        {row.p}
      </div>
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
