import { useEffect } from 'react'
import { Layout, Menu, Typography } from 'antd'
import {
  DashboardOutlined,
  PieChartOutlined,
  FilterOutlined,
  CopyOutlined,
  ClearOutlined,
  HistoryOutlined,
  SettingOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import { useApp, type PageKey } from './stores/app'
import { api } from './api'
import Dashboard from './pages/Dashboard'
import Analyzer from './pages/Analyzer'
import SmartFilter from './pages/SmartFilter'
import Duplicates from './pages/Duplicates'
import JunkCleaner from './pages/JunkCleaner'
import History from './pages/History'
import Settings from './pages/Settings'

const { Sider, Content } = Layout

const MENU: { key: PageKey; icon: React.ReactNode; label: string }[] = [
  { key: 'dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: 'analyzer', icon: <PieChartOutlined />, label: '空间分析' },
  { key: 'filter', icon: <FilterOutlined />, label: '智能筛选' },
  { key: 'duplicates', icon: <CopyOutlined />, label: '重复文件' },
  { key: 'junk', icon: <ClearOutlined />, label: '垃圾清理' },
  { key: 'history', icon: <HistoryOutlined />, label: '安全中心' },
  { key: 'settings', icon: <SettingOutlined />, label: '设置' }
]

export default function App(): React.ReactElement {
  const page = useApp((s) => s.page)
  const setPage = useApp((s) => s.setPage)
  const onProgress = useApp((s) => s.onProgress)
  const onDone = useApp((s) => s.onDone)
  const loadSettings = useApp((s) => s.loadSettings)

  useEffect(() => {
    const off1 = api.onScanProgress(onProgress)
    const off2 = api.onScanDone(onDone)
    void loadSettings()
    return () => {
      off1()
      off2()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider width={200} style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '18px 16px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.06)'
          }}
        >
          <DeleteOutlined style={{ fontSize: 22, color: '#4096ff' }} />
          <div>
            <Typography.Text strong style={{ fontSize: 15 }}>
              磁盘清理专家
            </Typography.Text>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>DiskSweeper</div>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[page]}
          items={MENU}
          onClick={(e) => setPage(e.key as PageKey)}
          style={{ borderInlineEnd: 'none', paddingTop: 6 }}
        />
      </Sider>
      <Content style={{ minWidth: 0 }}>
        {page === 'dashboard' && <Dashboard />}
        {page === 'analyzer' && <Analyzer />}
        {page === 'filter' && <SmartFilter />}
        {page === 'duplicates' && <Duplicates />}
        {page === 'junk' && <JunkCleaner />}
        {page === 'history' && <History />}
        {page === 'settings' && <Settings />}
      </Content>
    </Layout>
  )
}
