import { getScanConstants } from '../plc/scanCycle'
import { DataTable } from '../components/DataTable'
import { formatDuration } from '../utils/format'

const dataFlowRows = [
  [
    'Sensors and events',
    <>
      <code>src/simulation/scenarios.ts</code> schedules faults, quality drift, jams, and maintenance stops; manual forces override photoeye tags for controlled troubleshooting.
    </>,
    'Photoeye, air, drive, package, and operator inputs are normalized before scan logic runs.',
  ],
  [
    'PLC scan',
    <>
      <code>src/plc/scanCycle.ts</code> executes deterministic scan phases at a fixed scan time and owns timers, state transitions, counters, and outputs.
    </>,
    'Machine state, permissives, output commands, alarm bits, and production counts are updated together.',
  ],
  [
    'Tags and alarms',
    <>
      <code>src/simulation/tagDatabase.ts</code>, <code>src/simulation/alarms.ts</code>, and <code>src/data/alarmCatalog.ts</code> expose the same records used by HMI screens.
    </>,
    'HMI, SCADA-style views, trends, maintenance, and reports read a shared tag and alarm model.',
  ],
  [
    'OEE and exports',
    <>
      <code>src/simulation/oee.ts</code>, <code>src/export/formatters.ts</code>, and <code>analytics/historian/pipeline.py</code> convert counts, downtime, and trends into static assets.
    </>,
    'Browser reports, CSV/JSON exports, and historian summaries are served from the static app bundle.',
  ],
]

const validationRows = [
  ['Simulation tests', <code>src/test/simulation.test.ts</code>, 'Checks scan-cycle behavior, state transitions, alarms, and metric calculations.'],
  ['UI smoke tests', <code>src/test/app-smoke.test.tsx</code>, 'Verifies the React screens render against the simulation state without a backend service.'],
  ['Historian tests', <code>analytics/tests/test_historian_pipeline.py</code>, 'Validates SQLite schema generation, SQL analysis, and static JSON/CSV export shape.'],
  ['Static build', <code>vite.config.ts</code>, 'Uses a relative Vite base so GitHub Pages can host the compiled assets without a runtime server.'],
]

export function MethodologyPage() {
  const constants = getScanConstants()
  return (
    <div className="screen stack">
      <section className="two-column">
        <div className="panel">
          <div className="section-heading">
            <h2>System purpose</h2>
            <span>Packaging-cell digital twin</span>
          </div>
          <p>
            This project models a small automated packaging cell so control logic, HMI behavior, alarms, OEE, and historian-style exports can be exercised in a browser. It is a deterministic simulation of machine behavior, not a live plant controller.
          </p>
        </div>
        <div className="panel">
          <div className="section-heading">
            <h2>System boundaries</h2>
            <span>Simulation vs. production</span>
          </div>
          <p>
            Field I/O is represented by generated package positions, scenario events, and manual forces. A production version would replace those simulated inputs with PLC or edge-device data, keep the same tag/alarm contracts, and add authenticated write paths for operator commands.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Data flow</h2>
          <span>Sensors to exports</span>
        </div>
        <DataTable columns={['Layer', 'Implementation notes', 'Result']} rows={dataFlowRows} />
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>PLC scan-cycle methodology</h2>
          <span>Deterministic client-side simulation</span>
        </div>
        <DataTable
          columns={['Phase', 'Purpose']}
          rows={[
            ['Read inputs', 'Evaluate package positions, scenario events, manual forces, and field sensor states.'],
            ['Run state machine', 'Move through stopped, starting, infeed, inspect, reject, discharge, blocked, fault, and recovery states.'],
            ['Update timers/counters', 'Advance dwell timers, overload delay, sensor stuck timer, part counts, and downtime seconds.'],
            ['Update outputs', 'Write conveyor run, reject cylinder, alarm bits, counts, and OEE tags.'],
            ['Log historian data', 'Append trend points and sensor transitions for reports and diagnostics.'],
          ]}
        />
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-heading">
            <h2>State machine reasoning</h2>
            <span>Safe progression</span>
          </div>
          <p>
            The state machine favors explicit stops, blocked states, faults, and recovery before motion. Start requests move through starting and infeed; package location then selects inspect, reject, accept, discharge, or index conveyor states.
          </p>
          <p>
            Timers make fault behavior repeatable: inspection dwell validates product presence, reject actuation waits for motion completion, infeed timeout catches missing product, and recovery prevents an immediate restart after a fault reset.
          </p>
        </div>
        <div className="panel">
          <div className="section-heading">
            <h2>Configured timers</h2>
            <span>Scan constants</span>
          </div>
          <DataTable
            columns={['Timer', 'Value']}
            rows={[
              ['Infeed timeout', formatDuration(constants.infeedTimeoutMs)],
              ['Inspection dwell', formatDuration(constants.inspectionDwellMs)],
              ['Reject actuation', formatDuration(constants.rejectActuationMs)],
              ['Motor overload delay', formatDuration(constants.motorOverloadDelayMs)],
              ['Sensor stuck timer', formatDuration(constants.sensorStuckDelayMs)],
              ['Recovery timer', formatDuration(constants.recoveryTimeMs)],
              ['Ideal cycle time', formatDuration(constants.idealCycleTimeMs)],
            ]}
          />
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-heading">
            <h2>Alarm logic</h2>
            <span>Diagnosis and recovery</span>
          </div>
          <p>
            Alarm inputs are reconciled each scan against <code>alarmCatalog</code>. New alarms increment fault counters, active alarms drive blocked or fault state, and cleared alarms remain visible until the operator acknowledges or clears history.
          </p>
          <p>
            Recovery text is stored with each alarm so diagnostics stay close to the condition: jams point to photoeyes and infeed clearance, overloads point to conveyor load and drive recovery, and reject faults point to air, valve, and cylinder checks.
          </p>
        </div>
        <div className="panel">
          <div className="section-heading">
            <h2>OEE math</h2>
            <span>Loss model</span>
          </div>
          <p>Availability = operating time / planned runtime. Blocked, fault, recovery, and maintenance-stop time reduce availability.</p>
          <p>Performance = ideal cycle time x total parts / operating time. Slow package flow or long stops reduce performance.</p>
          <p>Quality = good parts / total parts. Rejects reduce quality while still counting toward total production.</p>
          <p>OEE = availability x performance x quality, calculated in <code>src/simulation/oee.ts</code>.</p>
        </div>
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="section-heading">
            <h2>Historian pipeline</h2>
            <span>Python, SQLite, static assets</span>
          </div>
          <p>
            The browser simulation keeps current-session historian points in memory. The offline pipeline in <code>analytics/historian/pipeline.py</code> generates a sample SQLite historian, runs SQL from <code>analytics/historian/queries.sql</code>, and exports dashboard-ready JSON/CSV under <code>public/data/</code>.
          </p>
          <p>
            During <code>vite build</code>, those files are copied into <code>dist/data/</code>. The deployed site can therefore run on GitHub Pages as static HTML, JavaScript, and data files without a database server.
          </p>
        </div>
        <div className="panel">
          <div className="section-heading">
            <h2>Production extension path</h2>
            <span>Same contracts, live data</span>
          </div>
          <p>
            A production integration would preserve the tag, alarm, OEE, and export contracts while changing the data source. PLC or OPC UA data would feed the tag database, a real historian would replace generated SQLite samples, and command writes would require authentication, audit logging, and interlock review.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Validation and maintainability</h2>
          <span>Tested project surfaces</span>
        </div>
        <DataTable columns={['Check', 'File or module', 'Purpose']} rows={validationRows} />
      </section>
    </div>
  )
}
