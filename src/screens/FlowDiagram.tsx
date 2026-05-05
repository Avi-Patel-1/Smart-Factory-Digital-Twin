const flowSteps = [
  ['1', 'Scenarios + manual inputs', 'Fault conditions, package flow, quality drift, and operator commands.'],
  ['2', 'Simulated field devices', 'Photoeyes, motor drive, air permissive, reject cylinder, and package position.'],
  ['3', 'PLC scan cycle', 'Read inputs, run state machine, update timers and counters, then write outputs.'],
  ['4', 'Shared tag model', 'Tags, alarms, counters, machine state, and OEE values feed every screen.'],
  ['5', 'HMI + digital twin', 'Operator views, machine diagram, trends, alarms, maintenance, and reports.'],
  ['6', 'Historian exports', 'Python and SQLite produce JSON and CSV files for static reporting.'],
]

const supportPaths = [
  ['Control path', 'scanCycle.ts owns deterministic machine progression, interlocks, outputs, counters, and alarms.'],
  ['Visibility path', 'The tag database, alarm catalog, and OEE model create HMI/SCADA-style operating context.'],
  ['Static path', 'Generated files under public/data are bundled by Vite and served with the dashboard build.'],
]

export function FlowDiagram() {
  return (
    <div className="screen stack">
      <section className="panel">
        <div className="section-heading">
          <h2>System Flow Diagram</h2>
          <span>High-level operating path</span>
        </div>
        <div className="block-flow">
          {flowSteps.map(([index, title, body]) => (
            <article className="flow-card" key={title}>
              <span className="flow-step-index">{index}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="flow-summary-grid">
        {supportPaths.map(([title, body]) => (
          <article className="panel" key={title}>
            <div className="section-heading">
              <h3>{title}</h3>
            </div>
            <p>{body}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
