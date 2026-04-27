export function ArchitecturePage() {
  const layers = [
    ['Field devices', 'Photoeyes, motor drive, reject cylinder, air permissive, and package signals.'],
    ['PLC', 'Runs scan logic, interlocks, timers, counters, alarms, and output commands.'],
    ['HMI', 'Gives operators state, alarms, counts, manual actions, and recovery instructions.'],
    ['SCADA', 'Aggregates line status and alarm context across equipment.'],
    ['Historian/database', 'Stores time-series values so downtime and process trends can be compared.'],
    ['Edge analytics', 'Calculates OEE, reject rate, cycle time, and maintenance indicators near the line.'],
    ['Dashboards', 'Turns tag and historian data into production, quality, and maintenance views.'],
    ['Business decision layer', 'Supports staffing, maintenance timing, quality containment, and throughput planning.'],
  ]

  return (
    <div className="screen stack">
      <section className="architecture-map">
        <div className="section-heading">
          <h2>Technical architecture</h2>
          <span>From sensor to decision</span>
        </div>
        <div className="architecture-flow">
          {layers.map(([name, description], index) => (
            <article key={name}>
              <strong>{index + 1}. {name}</strong>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <h2>How PLC tags become visibility</h2>
          <p>
            The PLC scan reads field inputs, evaluates state logic, updates timers and counters, then writes outputs and alarm bits. HMI and SCADA screens subscribe to those tags so operators see the same state the controls program is using.
          </p>
        </div>
        <div className="panel">
          <h2>How downtime becomes OEE</h2>
          <p>
            Downtime begins when the machine is blocked, faulted, or recovering while production is expected. That loss reduces availability, while cycle time and reject count reduce performance and quality.
          </p>
        </div>
        <div className="panel">
          <h2>Why sensor data matters</h2>
          <p>
            Photoeye transitions prove whether product is moving through the cell. Long dwell, missing transitions, and stuck inputs separate mechanical faults from process quality losses.
          </p>
        </div>
        <div className="panel">
          <h2>Decision support</h2>
          <p>
            Production teams can compare throughput and rejects, maintenance can prioritize recurring faults, and operations can quantify the cost of downtime with consistent calculations.
          </p>
        </div>
      </section>
    </div>
  )
}
