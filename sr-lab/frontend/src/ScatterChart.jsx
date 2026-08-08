import { useMemo, useState } from 'react'

/**
 * Predicted-vs-actual scatter for one equation, on the held-out test split.
 * Single series (series-1 blue), y = x reference line in neutral baseline
 * gray, hairline grid, per-mark hover tooltip. One axis pair, no legend box —
 * the title names the single series.
 */
export default function ScatterChart({ actual, predicted }) {
  const [hover, setHover] = useState(null)

  const W = 460, H = 340
  const M = { top: 16, right: 16, bottom: 42, left: 58 }
  const iw = W - M.left - M.right
  const ih = H - M.top - M.bottom

  const { pts, lo, hi, ticks } = useMemo(() => {
    const all = [...actual, ...predicted]
    let lo = Math.min(...all), hi = Math.max(...all)
    if (lo === hi) { lo -= 1; hi += 1 }
    const pad = (hi - lo) * 0.05
    lo -= pad; hi += pad
    const sx = (v) => M.left + ((v - lo) / (hi - lo)) * iw
    const sy = (v) => M.top + ih - ((v - lo) / (hi - lo)) * ih
    const pts = actual.map((a, i) => ({
      a, p: predicted[i], x: sx(a), y: sy(predicted[i]),
    }))
    const n = 5
    const ticks = Array.from({ length: n }, (_, i) => {
      const v = lo + ((hi - lo) * i) / (n - 1)
      return { v, x: sx(v), y: sy(v) }
    })
    return { pts, lo, hi, ticks }
  }, [actual, predicted])

  const fmt = (v) =>
    Math.abs(v) >= 1000 ? v.toExponential(1) : +v.toPrecision(3)

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', maxWidth: 560, display: 'block' }}
        role="img"
        aria-label="Predicted versus actual values on the held-out test split"
      >
        {/* hairline grid */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={M.left} x2={W - M.right} y1={t.y} y2={t.y}
              stroke="var(--gridline)" strokeWidth="1" />
            <line x1={t.x} x2={t.x} y1={M.top} y2={M.top + ih}
              stroke="var(--gridline)" strokeWidth="1" />
            <text x={M.left - 8} y={t.y + 4} textAnchor="end"
              fontSize="11" fill="var(--text-muted)">{fmt(t.v)}</text>
            <text x={t.x} y={M.top + ih + 18} textAnchor="middle"
              fontSize="11" fill="var(--text-muted)">{fmt(t.v)}</text>
          </g>
        ))}

        {/* axes */}
        <line x1={M.left} x2={W - M.right} y1={M.top + ih} y2={M.top + ih}
          stroke="var(--baseline)" strokeWidth="1" />
        <line x1={M.left} x2={M.left} y1={M.top} y2={M.top + ih}
          stroke="var(--baseline)" strokeWidth="1" />

        {/* y = x reference (perfect prediction) */}
        <line
          x1={M.left} y1={M.top + ih}
          x2={W - M.right} y2={M.top}
          stroke="var(--baseline)" strokeWidth="1.5" strokeDasharray="5 4"
        />

        {/* data marks — single series, ≥8px targets via invisible halo */}
        {pts.map((pt, i) => (
          <g key={i}>
            <circle cx={pt.x} cy={pt.y} r="9" fill="transparent"
              onMouseEnter={() => setHover(pt)}
              onMouseLeave={() => setHover(null)} />
            <circle cx={pt.x} cy={pt.y} r="4"
              fill="var(--series-1)" fillOpacity="0.55"
              stroke="var(--surface-1)" strokeWidth="1"
              pointerEvents="none" />
          </g>
        ))}

        {/* hovered mark emphasis */}
        {hover && (
          <circle cx={hover.x} cy={hover.y} r="6"
            fill="var(--series-1)"
            stroke="var(--surface-1)" strokeWidth="2"
            pointerEvents="none" />
        )}

        {/* axis titles */}
        <text x={M.left + iw / 2} y={H - 6} textAnchor="middle"
          fontSize="12" fill="var(--text-secondary)">Actual (test split)</text>
        <text x={14} y={M.top + ih / 2} textAnchor="middle"
          fontSize="12" fill="var(--text-secondary)"
          transform={`rotate(-90 14 ${M.top + ih / 2})`}>Predicted</text>
      </svg>

      {hover && (
        <div style={{
          position: 'absolute',
          left: `${(hover.x / W) * 100}%`,
          top: `${(hover.y / H) * 100}%`,
          transform: 'translate(10px, -110%)',
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '6px 9px',
          fontSize: 12,
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ color: 'var(--text-secondary)' }}>actual {fmt(hover.a)}</div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>predicted {fmt(hover.p)}</div>
        </div>
      )}
    </div>
  )
}
