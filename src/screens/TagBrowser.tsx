import { useMemo, useState } from 'react'
import type { SimulationState } from '../types'
import { DataTable } from '../components/DataTable'
import { formatTimestamp } from '../utils/format'

interface TagBrowserProps {
  state: SimulationState
}

export function TagBrowser({ state }: TagBrowserProps) {
  const [query, setQuery] = useState('')
  const [quality, setQuality] = useState('all')
  const tags = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return Object.values(state.tags)
      .filter((tag) => quality === 'all' || tag.quality === quality)
      .filter((tag) => `${tag.name} ${tag.source} ${tag.description}`.toLowerCase().includes(normalized))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [quality, query, state.tags])

  const rows = tags.map((tag) => [
    tag.name,
    tag.type,
    String(tag.value),
    tag.source,
    tag.description,
    formatTimestamp(tag.lastChangedMs),
    tag.quality,
  ])

  return (
    <div className="screen stack">
      <section className="panel">
        <div className="section-heading">
          <h2>Tag browser</h2>
          <span>{rows.length} visible tags</span>
        </div>
        <div className="filter-row">
          <label>
            Search
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter tags, sources, descriptions" />
          </label>
          <label>
            Quality
            <select value={quality} onChange={(event) => setQuality(event.target.value)}>
              <option value="all">All</option>
              <option value="Good">Good</option>
              <option value="Forced">Forced</option>
              <option value="Bad">Bad</option>
              <option value="Simulated">Simulated</option>
            </select>
          </label>
        </div>
        <DataTable
          columns={['Tag name', 'Type', 'Current value', 'Source', 'Description', 'Last changed', 'Quality']}
          rows={rows}
        />
      </section>
    </div>
  )
}
