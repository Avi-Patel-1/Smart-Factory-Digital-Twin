import { useState } from 'react'
import type { PackageItem, SimulationState, TagRecord } from '../types'
import { DataTable } from '../components/DataTable'
import { formatNumber } from '../utils/format'

interface DigitalTwinViewProps {
  state: SimulationState
}

function packageColor(item: PackageItem): string {
  if (item.reject && item.inspected) return '#f97316'
  if (item.inspected) return '#22c55e'
  return '#38bdf8'
}

export function DigitalTwinView({ state }: DigitalTwinViewProps) {
  const [selectedTagName, setSelectedTagName] = useState('MTR_CONV_RUN')
  const selectedTag: TagRecord = state.tags[selectedTagName] ?? state.tags.MTR_CONV_RUN
  const componentRows = [
    ['Conveyor', state.tags.MTR_CONV_RUN.value ? 'Running' : 'Stopped', state.tags.DRV_CONV_LOAD_PCT.value],
    ['Motor/drive', state.tags.MTR_CONV_FAULT.value ? 'Fault' : 'Ready', `${state.tags.MTR_CONV_CURRENT_A.value} A`],
    ['PLC scan', `${state.scanTimeMs} ms`, state.machineState],
    ['HMI/SCADA', 'Monitoring', `${state.alarms.filter((alarm) => alarm.active).length} active alarms`],
    ['Edge analytics', 'Calculating', `${formatNumber(state.metrics.throughputPerMinute, 1)} ppm`],
  ]

  return (
    <div className="screen twin-layout">
      <section className="twin-canvas">
        <div className="section-heading">
          <h2>Digital twin view</h2>
          <span>Clickable live components</span>
        </div>
        <svg viewBox="0 0 980 470" role="img" aria-label="Packaging cell digital twin">
          <defs>
            <linearGradient id="belt" x1="0" x2="1">
              <stop offset="0" stopColor="#334155" />
              <stop offset="1" stopColor="#64748b" />
            </linearGradient>
          </defs>
          <rect x="60" y="205" width="690" height="70" rx="8" fill="url(#belt)" />
          <g className="belt-lines">
            {Array.from({ length: 13 }).map((_, index) => (
              <line key={index} x1={90 + index * 50} x2={120 + index * 50} y1="205" y2="275" />
            ))}
          </g>
          <g role="button" tabIndex={0} onClick={() => setSelectedTagName('PE_INFEED_BLOCKED')}>
            <circle cx="130" cy="170" r="18" className={state.tags.PE_INFEED_BLOCKED.value ? 'svg-live' : 'svg-idle'} />
          </g>
          <text x="90" y="142">Infeed PE</text>
          <g role="button" tabIndex={0} onClick={() => setSelectedTagName('PE_INSPECTION_PRESENT')}>
            <rect x="360" y="120" width="150" height="72" rx="8" className={state.tags.PE_INSPECTION_PRESENT.value ? 'svg-live' : 'svg-block'} />
          </g>
          <text x="386" y="162">Inspection</text>
          <g role="button" tabIndex={0} onClick={() => setSelectedTagName('CYL_REJECT_EXT')}>
            <path d="M575 275 L665 360 L695 336 L610 260 Z" className={state.tags.CYL_REJECT_EXT.value ? 'svg-warn' : 'svg-block'} />
          </g>
          <text x="622" y="385">Reject diverter</text>
          <g role="button" tabIndex={0} onClick={() => setSelectedTagName('PE_EXIT_BLOCKED')}>
            <circle cx="725" cy="170" r="18" className={state.tags.PE_EXIT_BLOCKED.value ? 'svg-live' : 'svg-idle'} />
          </g>
          <text x="690" y="142">Exit PE</text>

          {state.packages.map((item) => {
            const x = 68 + item.position * 6.6
            const y = item.diverted ? 324 : 218
            return (
              <g key={item.id} className="package">
                <rect x={x} y={y} width="36" height="42" rx="5" fill={packageColor(item)} />
                <text x={x + 10} y={y + 27}>{item.id}</text>
              </g>
            )
          })}

          <g role="button" tabIndex={0} onClick={() => setSelectedTagName('MTR_CONV_RUN')}>
            <rect x="80" y="320" width="170" height="82" rx="8" className="svg-block" />
          </g>
          <text x="112" y="352">Motor / drive</text>
          <text x="112" y="378">{state.tags.MTR_CONV_RUN.value ? 'RUN' : 'STOP'} · {state.tags.MTR_CONV_CURRENT_A.value} A</text>

          <g role="button" tabIndex={0} onClick={() => setSelectedTagName('STATE_MACHINE')}>
            <rect x="800" y="60" width="130" height="82" rx="8" className="svg-block" />
          </g>
          <text x="832" y="94">PLC</text>
          <text x="818" y="120">{state.machineState}</text>

          <g role="button" tabIndex={0} onClick={() => setSelectedTagName('OEE_OVERALL')}>
            <rect x="790" y="185" width="155" height="76" rx="8" className="svg-block" />
          </g>
          <text x="824" y="218">HMI/SCADA</text>
          <text x="817" y="244">OEE {(state.metrics.oee * 100).toFixed(1)}%</text>

          <g role="button" tabIndex={0} onClick={() => setSelectedTagName('CELL_THROUGHPUT_PPM')}>
            <rect x="790" y="305" width="155" height="76" rx="8" className="svg-block" />
          </g>
          <text x="818" y="338">Edge analytics</text>
          <text x="824" y="364">{formatNumber(state.metrics.throughputPerMinute, 1)} ppm</text>
        </svg>
      </section>

      <aside className="inspector-panel">
        <h3>Selected tag</h3>
        <dl>
          <dt>Name</dt>
          <dd>{selectedTag.name}</dd>
          <dt>Value</dt>
          <dd>{String(selectedTag.value)}</dd>
          <dt>Source</dt>
          <dd>{selectedTag.source}</dd>
          <dt>Quality</dt>
          <dd>{selectedTag.quality}</dd>
          <dt>Description</dt>
          <dd>{selectedTag.description}</dd>
        </dl>
        <DataTable columns={['Component', 'Status', 'Live value']} rows={componentRows} />
      </aside>
    </div>
  )
}
