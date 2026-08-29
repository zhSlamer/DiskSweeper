import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#4096ff',
          colorBgBase: '#141414',
          borderRadius: 6,
          fontSize: 13
        },
        components: {
          Layout: {
            siderBg: '#1d1d1f',
            headerBg: '#1a1a1c',
            bodyBg: '#141414'
          },
          Menu: {
            itemBg: 'transparent',
            itemSelectedBg: 'rgba(64,150,255,0.18)'
          },
          Table: {
            headerBg: '#1f1f23',
            rowHoverBg: 'rgba(64,150,255,0.08)'
          }
        }
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
)
