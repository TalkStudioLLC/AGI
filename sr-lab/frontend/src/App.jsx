import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import ScatterChart from './ScatterChart'

const r2fmt = (v) => (v == null ? '—' : v.toFixed(4))

export default function App() {
  const [datasets, setDatasets] = useState([])
  const [selected, setSelected] = useState(null)
  const [preview, setPreview] = useState(null)
  const [config, setConfig] = useState({ population_size: 2000, generations: 25 })
  const [run, setRun] = useState(null)
  const [equations, setEquations] = useState([])
  const [selectedEq, setSelectedEq] = useState(null)
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => {
    api.listDatasets().then(setDatasets).catch((e) => setError(String(e)))
    return () => clearInterval(pollRef.current)
  }, [])

  const pickDataset = useCallback((ds) => {
    setSelected(ds)
    setPreview(null)
    setEquations([])
    setSelectedEq(null)
    setRun(null)
    api.previewDataset(ds.id).then(setPreview).catch((e) => setError(String(e)))
  }, [])

  const launch = useCallback(async () => {
    if (!selected) return
    setError(null)
    setEquations([])
    setSelectedEq(null)
    try {
      const { run_id } = await api.startRun({
        dataset_id: selected.id,
        population_size: Number(config.population_size) || undefined,
        generations: Number(config.generations) || undefined,
      })
      setRun({ id: run_id, status: 'running' })
      clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        const r = await api.getRun(run_id)
        setRun(r)
        if (r.status === 'finished' || r.status === 'failed') {
          clearInterval(pollRef.current)
          if (r.status === 'finished') {
            const eqs = await api.getEquations(run_id)
            setEquations(eqs)
            setSelectedEq(eqs[0] ?? null)
          }
        }
      }, 2500)
    } catch (e) {
      setError(String(e))
    }
  }, [selected, config])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Symbolic Regression Lab</h1>
        <p>
          Search for closed-form equations that fit a dataset, scored on a
          held-out test split. Validate the pipeline by rediscovering known
          physical laws.
        </p>
      </header>

      <div className="layout">
        <aside>
          <div className="card">
            <h2>Datasets</h2>
            {datasets.map((ds) => (
              <button
                key={ds.id}
                className={`ds-item${selected?.id === ds.id ? ' selected' : ''}`}
                onClick={() => pickDataset(ds)}
              >
                <span className="ds-name">{ds.name}</span>
                <span className="ds-meta">
                  {ds.n_rows} rows · target {ds.target_col} · features{' '}
                  {ds.feature_cols.join(', ')}
                </span>
              </button>
            ))}
          </div>

          {selected && (
            <div className="card">
              <h2>Run configuration</h2>
              <div className="field">
                <label htmlFor="pop">Population size</label>
                <input
                  id="pop" type="number" min="100" step="100"
                  value={config.population_size}
                  onChange={(e) => setConfig((c) => ({ ...c, population_size: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="gen">Generations</label>
                <input
                  id="gen" type="number" min="1"
                  value={config.generations}
                  onChange={(e) => setConfig((c) => ({ ...c, generations: e.target.value }))}
                />
              </div>
              <button
                className="btn"
                onClick={launch}
                disabled={run?.status === 'running'}
              >
                {run?.status === 'running' ? 'Searching…' : 'Start search'}
              </button>
              {run && (
                <div className="status-line">
                  Run #{run.id}:{' '}
                  <span className={`status-${run.status}`}>{run.status}</span>
                  {run.status === 'running' && ' — evolving candidate equations'}
                </div>
              )}
              {run?.error && <div className="status-line status-failed">{run.error.slice(-300)}</div>}
            </div>
          )}
        </aside>

        <main>
          {error && <div className="card status-failed">{error}</div>}

          {selected && (
            <div className="card">
              <h2>{selected.name}</h2>
              <p className="hint">{selected.description}</p>
              {selected.true_law && (
                <div className="true-law">
                  Known law (held back from the search):{' '}
                  <code>{selected.true_law}</code>
                </div>
              )}
              {preview && (
                <table className="data" style={{ marginTop: 10 }}>
                  <thead>
                    <tr>{preview.columns.map((c) => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {equations.length > 0 && (
            <div className="card">
              <h2>Discovered equations — ranked by held-out R²</h2>
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Equation (simplified)</th>
                    <th>Complexity</th>
                    <th>Train R²</th>
                    <th>Test R²</th>
                  </tr>
                </thead>
                <tbody>
                  {equations.map((eq) => (
                    <tr
                      key={eq.rank}
                      className={`selectable${selectedEq?.rank === eq.rank ? ' selected' : ''}`}
                      onClick={() => setSelectedEq(eq)}
                    >
                      <td>{eq.rank}</td>
                      <td className="eq-expr">{selected?.target_col} = {eq.simplified}</td>
                      <td>{eq.complexity}</td>
                      <td>{r2fmt(eq.train_r2)}</td>
                      <td style={{ fontWeight: 600 }}>{r2fmt(eq.test_r2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hint" style={{ marginTop: 8 }}>
                Test R² is the score that matters — it measures the equation on
                data the search never saw. Train ≫ test means overfitting.
              </p>
            </div>
          )}

          {selectedEq && (
            <div className="card">
              <h2>
                Rank {selectedEq.rank} — predicted vs. actual on the test split
              </h2>
              <p className="eq-expr" style={{ margin: '0 0 8px' }}>
                {selected?.target_col} = {selectedEq.simplified}
              </p>
              <ScatterChart
                actual={selectedEq.predictions.actual}
                predicted={selectedEq.predictions.predicted}
              />
              <p className="hint">
                Points on the dashed y&nbsp;=&nbsp;x line are perfect
                predictions. Hover any point for its values.
              </p>
            </div>
          )}

          {!selected && (
            <div className="card">
              <p className="hint">
                Pick a dataset on the left, then start a search. Each bundled
                dataset was generated from a known physical law plus 1% noise —
                if the search recovers the law, the pipeline works, and it's
                ready to point at data where the law is unknown.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
