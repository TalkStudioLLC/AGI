const BASE = '/api'

async function j(url, opts) {
  const res = await fetch(BASE + url, opts)
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

export const listDatasets = () => j('/datasets')
export const previewDataset = (id) => j(`/datasets/${id}/preview`)
export const startRun = (body) =>
  j('/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
export const listRuns = () => j('/runs')
export const getRun = (id) => j(`/runs/${id}`)
export const getEquations = (id) => j(`/runs/${id}/equations`)
