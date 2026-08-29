import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography
} from 'antd'
import {
  SearchOutlined,
  StopOutlined,
  FolderOpenOutlined,
  DownloadOutlined,
  DeleteOutlined,
  ExportOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  AimOutlined
} from '@ant-design/icons'
import type { FileCategory, FileRow, FilterConditions, FilterPage } from '../../shared/types'
import { PRESETS, CATEGORY_EXTS, CATEGORY_LABELS, isProtectedPath } from '../../shared/constants'
import { formatBytes, formatTime } from '../../shared/utils'
import { api } from '../api'
import { useApp } from '../stores/app'
import FilePropsDrawer from '../components/FilePropsDrawer'

type DeleteKind = 'recycle' | 'permanent' | 'shred'

export default function SmartFilter(): React.ReactElement {
  const { message, modal } = AntApp.useApp()
  const scanId = useApp((s) => s.scanId)
  const scanRoot = useApp((s) => s.scanRoot)
  const running = useApp((s) => s.running)
  const progress = useApp((s) => s.progress)
  const beginScan = useApp((s) => s.beginScan)
  const cancel = useApp((s) => s.cancel)

  const [root, setRoot] = useState('')
  const [conds, setConds] = useState<FilterConditions>({ sizeMin: 100 * 1024 * 1024 })
  const [pageIdx, setPageIdx] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [sort, setSort] = useState<{ key: 'name' | 'size' | 'mtime' | 'path' | 'ext'; order: 'asc' | 'desc' }>({
    key: 'size',
    order: 'desc'
  })
  const [result, setResult] = useState<FilterPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<FileRow[]>([])
  const [propsRow, setPropsRow] = useState<FileRow | null>(null)

  useEffect(() => {
    if (scanRoot) setRoot(scanRoot)
  }, [scanRoot])

  const query = useCallback(
    (page = pageIdx, size = pageSize, s = sort) => {
      if (!scanId) return
      setLoading(true)
      api
        .filterQuery({ scanId, conditions: conds, sort: s, page, pageSize: size })
        .then(setResult)
        .catch((e) => void message.error(String(e)))
        .finally(() => setLoading(false))
    },
    [scanId, conds, pageIdx, pageSize, sort]
  )

  useEffect(() => {
    setSelected([])
    setPageIdx(0)
    query(0, pageSize, sort)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, conds])

  const runPreset = (key: string): void => {
    const p = PRESETS.find((x) => x.key === key)
    if (p) setConds({ ...p.conditions })
  }

  const doScan = (): void => {
    if (!root.trim()) return
    beginScan(root.trim()).catch((e) => void message.error(String(e instanceof Error ? e.message : e)))
  }

  /* ---------- 批量操作 ---------- */
  const selectedPaths = selected.map((r) => r.p)
  const selectedBytes = selected.reduce((a, r) => a + r.s, 0)
  const hasProtected = selectedPaths.some((p) => isProtectedPath(p))

  const confirmDanger = (kind: DeleteKind, onOk: (force: boolean) => void): void => {
    const titles: Record<DeleteKind, string> = {
      recycle: '删除到回收站',
      permanent: '永久删除（不进回收站，无法恢复！）',
      shred: '粉碎删除（覆写后删除，彻底无法恢复！）'
    }
    const danger = kind !== 'recycle'
    modal.confirm({
      title: titles[kind],
      content: (
        <div>
          <p>
            共 <b>{selectedPaths.length}</b> 项，{kind === 'recycle' ? '大小' : '释放'} {formatBytes(selectedBytes)}
          </p>
          {hasProtected && danger && (
            <Alert
              type="error"
              showIcon
              message="检测到系统关键目录（Windows / Program Files 等）中的内容"
              description="这些是系统组件，删除可能导致系统或软件损坏。请确认你清楚自己在做什么。"
              style={{ marginTop: 8 }}
            />
          )}
        </div>
      ),
      okText: kind === 'recycle' ? '删除' : '仍要执行',
      okButtonProps: { danger },
      cancelText: '取消',
      onOk: () => onOk(true)
    })
  }

  const handleDelete = (kind: DeleteKind): void => {
    if (selectedPaths.length === 0) return
    confirmDanger(kind, (force) => {
      api
        .delete(selectedPaths, kind, force)
        .then((r) => {
          void message.success(`完成：成功 ${r.ok}，失败 ${r.fail}`)
          setSelected([])
          query()
        })
        .catch((e) => void message.error(String(e instanceof Error ? e.message : e)))
    })
  }

  const handleMove = (): void => {
    if (selectedPaths.length === 0) return
    let dest = ''
    Modal.confirm({
      title: '移动到…',
      content: (
        <MovePick
          defaultDir={scanRoot}
          onPick={(d) => {
            dest = d
          }}
        />
      ),
      okText: '移动',
      cancelText: '取消',
      onOk: () =>
        new Promise<void>((resolve) => {
          if (!dest) {
            void message.warning('请选择目标文件夹')
            resolve()
            return
          }
          api
            .move(selectedPaths, dest)
            .then((r) => {
              void message.success(`移动完成：成功 ${r.ok}，失败 ${r.fail}`)
              setSelected([])
              query()
            })
            .finally(() => resolve())
        })
    })
  }

  const handleQuarantine = (): void => {
    if (selectedPaths.length === 0) return
    api
      .quarantine(selectedPaths)
      .then((r) => {
        void message.success(`已隔离 ${r.ok} 项，可在"安全中心"恢复`)
        setSelected([])
        query()
      })
      .catch((e) => void message.error(String(e)))
  }

  const doExport = (format: 'csv' | 'json'): void => {
    if (!scanId) return
    api
      .filterExport({ scanId, conditions: conds, sort, page: 0, pageSize }, format)
      .then((r) => {
        if (r.ok) void message.success(`已导出 ${r.count} 行`)
      })
      .catch((e) => void message.error(String(e)))
  }

  return (
    <div className="page">
      <h1 className="page-title">智能筛选</h1>
      <div className="page-sub">按预设或自定义条件筛选文件，批量清理、移动或导出清单</div>

      {!scanId && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="先选择要分析的目录"
              value={root}
              onChange={(e) => setRoot(e.target.value)}
              onPressEnter={doScan}
              disabled={running}
            />
            <Button
              icon={<FolderOpenOutlined />}
              disabled={running}
              onClick={async () => {
                const d = await api.openDirDialog(root || undefined)
                if (d) setRoot(d)
              }}
            >
              浏览…
            </Button>
            {running ? (
              <Button danger icon={<StopOutlined />} onClick={() => void cancel()}>
                取消
              </Button>
            ) : (
              <Button type="primary" icon={<SearchOutlined />} onClick={doScan}>
                扫描
              </Button>
            )}
          </Space.Compact>
          {running && progress && (
            <div style={{ marginTop: 10 }}>
              <Progress percent={Math.min(99, progress.files / 2000)} showInfo={false} size="small" status="active" />
              <span className="page-sub">
                已发现 {progress.files.toLocaleString()} 个文件 · {formatBytes(progress.bytes)}
              </span>
            </div>
          )}
        </Card>
      )}

      {scanId && (
        <Row gutter={12} wrap={false}>
          <Col style={{ flex: '0 0 300px', minWidth: 300 }}>
            <FilterPanel conds={conds} setConds={setConds} onPreset={runPreset} activePresetKey={undefined} />
            <Card size="small" title="导出" style={{ marginTop: 12 }}>
              <Space>
                <Button icon={<DownloadOutlined />} onClick={() => doExport('csv')}>
                  导出 CSV
                </Button>
                <Button icon={<DownloadOutlined />} onClick={() => doExport('json')}>
                  导出 JSON
                </Button>
              </Space>
            </Card>
          </Col>
          <Col style={{ flex: '1 1 0%', minWidth: 0 }}>
            <Card size="small" style={{ marginBottom: 12 }}>
              <Space size={30} wrap>
                <Statistic title="命中" value={result?.total.toLocaleString() ?? '-'} />
                <Statistic title="总大小" value={result ? formatBytes(result.totalBytes) : '-'} />
                {selected.length > 0 && (
                  <>
                    <Statistic
                      title="已选"
                      value={selected.length}
                      suffix={`/ ${formatBytes(selectedBytes)}`}
                      valueStyle={{ color: '#4096ff' }}
                    />
                    <Space>
                      <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete('recycle')}>
                        回收站
                      </Button>
                      <Button icon={<SafetyCertificateOutlined />} onClick={handleQuarantine}>
                        隔离
                      </Button>
                      <Button icon={<ExportOutlined />} onClick={handleMove}>
                        移动…
                      </Button>
                      <Button danger ghost onClick={() => handleDelete('permanent')}>
                        永久删除
                      </Button>
                      <Button danger ghost type="primary" onClick={() => handleDelete('shred')}>
                        粉碎
                      </Button>
                    </Space>
                  </>
                )}
              </Space>
            </Card>
            <Card size="small">
              <Table<FileRow>
                size="small"
                loading={loading}
                rowKey="p"
                dataSource={result?.rows ?? []}
                rowSelection={{
                  selectedRowKeys: selected.map((r) => r.p),
                  onChange: (_keys, rows) => setSelected(rows)
                }}
                onRow={(r) => ({ onClick: () => setPropsRow(r), style: { cursor: 'pointer' } })}
                onChange={(_pg, _fil, sorter) => {
                  const s = Array.isArray(sorter) ? sorter[0] : sorter
                  if (s && !Array.isArray(s) && s.order) {
                    const key = (s.field as string) as 'name' | 'size' | 'mtime' | 'path' | 'ext'
                    const order = s.order === 'ascend' ? 'asc' : 'desc'
                    setSort({ key, order })
                    query(pageIdx, pageSize, { key, order })
                  }
                }}
                columns={[
                  {
                    title: '名称',
                    dataIndex: 'n',
                    ellipsis: { showTitle: false },
                    render: (n: string, r) => (
                      <span title={r.p}>
                        {r.dir ? '📁 ' : '📄 '}
                        {n}
                      </span>
                    ),
                    sorter: true,
                    sortOrder: sort.key === 'name' ? (sort.order === 'asc' ? 'ascend' : 'descend') : null
                  },
                  {
                    title: '大小',
                    dataIndex: 's',
                    width: 110,
                    render: (v: number) => formatBytes(v),
                    sorter: true,
                    defaultSortOrder: 'descend',
                    sortOrder: sort.key === 'size' ? (sort.order === 'asc' ? 'ascend' : 'descend') : null
                  },
                  {
                    title: '修改时间',
                    dataIndex: 'mt',
                    width: 140,
                    render: (v: number) => formatTime(v),
                    sorter: true,
                    sortOrder: sort.key === 'mtime' ? (sort.order === 'asc' ? 'ascend' : 'descend') : null
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
                pagination={{
                  size: 'small',
                  current: pageIdx + 1,
                  pageSize,
                  total: result?.total ?? 0,
                  showSizeChanger: true,
                  pageSizeOptions: [20, 50, 100, 200],
                  showTotal: (t) => `共 ${t.toLocaleString()} 项`,
                  onChange: (p, ps) => {
                    setPageIdx(p - 1)
                    setPageSize(ps)
                    query(p - 1, ps, sort)
                  }
                }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <FilePropsDrawer row={propsRow} onClose={() => setPropsRow(null)} />
    </div>
  )
}

function MovePick({ defaultDir, onPick }: { defaultDir: string; onPick: (d: string) => void }): React.ReactElement {
  const [dir, setDir] = useState(defaultDir)
  useEffect(() => onPick(dir), [dir, onPick])
  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="目标文件夹" />
      <Button
        onClick={async () => {
          const d = await api.openDirDialog(dir)
          if (d) setDir(d)
        }}
      >
        选择
      </Button>
    </Space.Compact>
  )
}

function FilterPanel({
  conds,
  setConds,
  onPreset
}: {
  conds: FilterConditions
  setConds: (c: FilterConditions) => void
  onPreset: (key: string) => void
  activePresetKey?: string
}): React.ReactElement {
  const patch = (p: Partial<FilterConditions>): void => setConds({ ...conds, ...p })
  const [sizeUnit, setSizeUnit] = useState<'MB' | 'GB'>('MB')
  const [extText, setExtText] = useState('')

  return (
    <Card size="small" title={<><ThunderboltOutlined /> 一键预设</>}>
      <Space size={[6, 6]} wrap style={{ marginBottom: 12 }}>
        {PRESETS.map((p) => (
          <Tag.CheckableTag
            key={p.key}
            checked={
              JSON.stringify(conds) === JSON.stringify(p.conditions)
            }
            onChange={() => onPreset(p.key)}
          >
            {p.label}
          </Tag.CheckableTag>
        ))}
      </Space>

      <Form layout="vertical" size="small">
        <Form.Item label="大小下限" style={{ marginBottom: 8 }}>
          <Space.Compact block>
            <Input
              type="number"
              min={0}
              value={conds.sizeMin !== undefined ? Math.round(conds.sizeMin / (sizeUnit === 'MB' ? 1048576 : 1073741824) * 100) / 100 : ''}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                patch({ sizeMin: isNaN(v) ? undefined : v * (sizeUnit === 'MB' ? 1048576 : 1073741824) })
              }}
            />
            <Segmented
              options={['MB', 'GB']}
              value={sizeUnit}
              onChange={(v) => setSizeUnit(v as 'MB' | 'GB')}
            />
          </Space.Compact>
        </Form.Item>

        <Form.Item label="文件类型" style={{ marginBottom: 8 }}>
          <Select
            mode="multiple"
            allowClear
            placeholder="全部类型"
            value={conds.categories}
            onChange={(v) => patch({ categories: v.length ? (v as FileCategory[]) : undefined })}
            options={(Object.keys(CATEGORY_EXTS) as FileCategory[]).map((k) => ({
              value: k,
              label: CATEGORY_LABELS[k]
            }))}
          />
        </Form.Item>

        <Form.Item label="扩展名（逗号分隔，如 jpg,png）" style={{ marginBottom: 8 }}>
          <Input
            value={extText}
            placeholder="留空不限"
            onChange={(e) => setExtText(e.target.value)}
            onBlur={() => {
              const list = extText
                .split(/[,，\s]+/)
                .map((x) => x.trim().toLowerCase().replace(/^\./, ''))
                .filter(Boolean)
              patch({ exts: list.length ? list : undefined })
            }}
          />
        </Form.Item>

        <Form.Item label="时间条件" style={{ marginBottom: 8 }}>
          <Space.Compact block>
            <Select
              style={{ width: 90 }}
              value={conds.dateField ?? 'mt'}
              onChange={(v) => patch({ dateField: v as 'mt' | 'ct' | 'at' })}
              options={[
                { value: 'mt', label: '修改于' },
                { value: 'ct', label: '创建于' },
                { value: 'at', label: '访问于' }
              ]}
            />
            <Select
              style={{ width: 76 }}
              value={conds.dateOp ?? 'older'}
              onChange={(v) => patch({ dateOp: v as 'older' | 'newer' })}
              options={[
                { value: 'older', label: '早于' },
                { value: 'newer', label: '晚于' }
              ]}
            />
            <Input
              type="number"
              min={0}
              style={{ width: 90 }}
              placeholder="天数"
              value={conds.dateDays}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                patch({ dateDays: isNaN(v) ? undefined : v })
              }}
            />
          </Space.Compact>
        </Form.Item>

        <Form.Item label="文件名" style={{ marginBottom: 8 }}>
          <Space.Compact block>
            <Select
              style={{ width: 96 }}
              value={conds.nameMode ?? 'contains'}
              onChange={(v) => patch({ nameMode: v as 'contains' | 'wildcard' | 'regex' })}
              options={[
                { value: 'contains', label: '包含' },
                { value: 'wildcard', label: '通配符' },
                { value: 'regex', label: '正则' }
              ]}
            />
            <Input
              placeholder="如 report / *.bak / ^tmp"
              value={conds.namePattern}
              onChange={(e) => patch({ namePattern: e.target.value || undefined })}
            />
          </Space.Compact>
        </Form.Item>

        <Space direction="vertical" size={2}>
          <Checkbox
            checked={conds.emptyOnly}
            onChange={(e) => patch({ emptyOnly: e.target.checked || undefined })}
          >
            仅 0 字节空文件
          </Checkbox>
          <Checkbox
            checked={conds.tempLike}
            onChange={(e) => patch({ tempLike: e.target.checked || undefined })}
          >
            仅临时/残留文件（tmp、bak、~$、.part 等）
          </Checkbox>
          <Checkbox
            checked={conds.dotHidden}
            onChange={(e) => patch({ dotHidden: e.target.checked || undefined })}
          >
            仅隐藏文件（. 开头）
          </Checkbox>
          <Checkbox
            checked={conds.onlyReadOnly}
            onChange={(e) => patch({ onlyReadOnly: e.target.checked || undefined })}
          >
            仅只读文件
          </Checkbox>
          <Checkbox
            checked={conds.onlySymlink}
            onChange={(e) => patch({ onlySymlink: e.target.checked || undefined })}
          >
            仅符号链接
          </Checkbox>
          <Checkbox
            checked={conds.emptyDirs}
            onChange={(e) => patch({ emptyDirs: e.target.checked || undefined })}
          >
            仅空文件夹
          </Checkbox>
        </Space>
      </Form>
      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
        修改条件后结果自动刷新
      </Typography.Text>
    </Card>
  )
}
