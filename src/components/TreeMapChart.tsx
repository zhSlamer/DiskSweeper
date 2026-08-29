import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { TreeMapNode } from '../../shared/types'

export default function TreeMapChart({
  data,
  onClick,
  height = 340
}: {
  data: TreeMapNode[]
  onClick?: (path: string, name: string) => void
  height?: number
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

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
          formatter: (p: { name: string; value: number; data: { files?: number } }) => {
            const gb = p.value >= 1024 ** 3
            const v = gb ? (p.value / 1024 ** 3).toFixed(2) + ' GB' : (p.value / 1024 ** 2).toFixed(1) + ' MB'
            return `${p.name}<br/>${v}${p.data.files !== undefined ? '<br/>' + p.data.files.toLocaleString() + ' 个文件' : ''}`
          }
        },
        series: [
          {
            type: 'treemap',
            data: data,
            roam: false,
            nodeClick: false,
            breadcrumb: { show: false },
            itemStyle: { borderColor: 'rgba(0,0,0,0.5)', gapWidth: 2 },
            upperLabel: { show: true, height: 22, color: '#ddd' },
            levels: [
              {
                itemStyle: { borderWidth: 0, gapWidth: 3 },
                colorSaturation: [0.35, 0.6]
              },
              {
                itemStyle: { gapWidth: 2, borderWidth: 1, borderColorSaturation: 0.7 },
                colorSaturation: [0.4, 0.75]
              }
            ],
            label: { show: true, formatter: '{b}', overflow: 'truncate' }
          }
        ]
      },
      true
    )
    chart.current.off('click')
    chart.current.on('click', (p: unknown) => {
      const d = (p as { data?: { path?: string; name?: string } }).data
      if (d?.path) onClick?.(d.path, d.name ?? '')
    })
  }, [data, onClick])

  return <div ref={ref} style={{ width: '100%', height }} />
}
