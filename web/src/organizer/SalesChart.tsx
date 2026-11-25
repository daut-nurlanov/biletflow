import { useId } from 'react'
import type { SalesDay } from './types'
import { dayLabel } from './analytics'
import { money } from './format'
import { Notice } from './ui'
import { useI18n } from "../i18n"

export default function SalesChart({ days }: { days: SalesDay[] }) {
  const { t: localize } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  if (!days.length)
    return <Notice>{localize("No confirmed orders in this selection.")}</Notice>
  const max = Math.max(...days.map((day) => Number(day.revenue)))
  if (max <= 0)
    return (
      <Notice>
        {localize("Confirmed orders in this selection have no paid revenue. See their ticket counts in the daily table.")}
      </Notice>
    )
  const first = Date.parse(days[0].day)
  const last = Date.parse(days[days.length - 1].day)
  const span = Math.max(1, (last - first) / 86_400_000)
  const width = Math.max(2, Math.min(36, 540 / (span + 1)))
  return (
    <figure
      className="org-sales-chart"
      tabIndex={0}
      aria-label={localize("Sales chart; scroll horizontally on narrow screens")}
    >
      <svg
        viewBox="0 0 800 300"
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>{localize("Confirmed order revenue by purchase date")}</title>
        <desc id={descriptionId}>
          {localize("Revenue in KZT. Dates use Almaty time. Refunded orders are excluded. Exact values are listed in the daily sales table below.")}
        </desc>
        {[0, 0.5, 1].map((fraction) => {
          const y = 240 - fraction * 190
          return (
            <g key={fraction}>
              <line
                x1="130"
                x2="755"
                y1={y}
                y2={y}
                className="org-chart-grid"
              />
              <text x="120" y={y + 4} textAnchor="end">
                {money(max * fraction)}
              </text>
            </g>
          )
        })}
        {days.map((day) => {
          const x =
            days.length === 1
              ? 440
              : 150 + ((Date.parse(day.day) - first) / (last - first)) * 580
          const height = (Number(day.revenue) / max) * 190
          return (
            <rect
              key={day.day}
              x={x - width / 2}
              y={240 - height}
              width={width}
              height={height}
              rx="3"
            >
              <title>{`${dayLabel(day.day)}: ${money(day.revenue)}, ${day.orders} orders, ${day.tickets} tickets`}</title>
            </rect>
          )
        })}
        <text x="150" y="275" textAnchor="start">
          {dayLabel(days[0].day)}
        </text>
        {days.length > 1 && (
          <text x="740" y="275" textAnchor="end">
            {dayLabel(days[days.length - 1].day)}
          </text>
        )}
      </svg>
      <figcaption className="muted">
        {localize("Revenue from currently confirmed orders, grouped by purchase date. Gaps contain no confirmed orders; refunded orders are excluded. Scroll horizontally on narrow screens.")}
      </figcaption>
    </figure>
  )
}
