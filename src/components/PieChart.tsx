import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

export interface PieDatum {
  name: string
  value: number
  count?: number
  itemStyle?: { color: string }
}

export default function PieChart({ data, height = 300 }: { data: PieDatum[]; height?: number }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    chart.current = echarts.init(ref.current)
    const ro = new ResizeObserver(() => chart.current?.resize())
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      chart.current?.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    if (!chart.current) return
    chart.current.setOption(
      {
        tooltip: {
          formatter: (p: { name: string; value: number; percent: number; data: { count?: number } }) => {
            const mb = p.value >= 1024 ** 3
            const v = mb ? (p.value / 1024 ** 3).toFixed(2) + ' GB' : (p.value / 1024 ** 2).toFixed(1) + ' MB'
            return `${p.name}<br/>${v}（${p.percent}%）${p.data.count !== undefined ? '<br/>' + p.data.count.toLocaleString() + ' 个' : ''}`
          }
        },
        legend: {
          type: 'scroll',
          orient: 'vertical',
          right: 0,
          top: 'middle',
          textStyle: { fontSize: 11, color: 'rgba(255,255,255,0.65)' }
        },
        series: [
          {
            type: 'pie',
            radius: ['38%', '72%'],
            center: ['38%', '50%'],
            data,
            label: { show: false },
            emphasis: {
              itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.4)' }
            }
          }
        ]
      },
      true
    )
  }, [data])

  return <div ref={ref} style={{ width: '100%', height }} />
}
