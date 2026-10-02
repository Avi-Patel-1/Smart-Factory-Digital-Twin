import type { KeyboardEvent, ReactNode } from 'react'
import type { SimulationState } from '../types'

const project = (x: number, y: number, z = 0) => [135 + x + y * 0.62, 355 - x * 0.11 - y * 0.52 - z]
const points = (values: number[][]) => values.map((point) => point.join(',')).join(' ')

function Box({
  x,
  y,
  w,
  d,
  h,
  z = 0,
  color,
  opacity = 1,
}: {
  x: number
  y: number
  w: number
  d: number
  h: number
  z?: number
  color: string
  opacity?: number
}) {
  const a = project(x, y, z)
  const b = project(x + w, y, z)
  const c = project(x + w, y + d, z)
  const e = project(x, y + d, z)
  const top = [
    project(x, y, z + h),
    project(x + w, y, z + h),
    project(x + w, y + d, z + h),
    project(x, y + d, z + h),
  ]
  return (
    <g opacity={opacity} stroke="#172523" strokeWidth="1.2">
      <polygon points={points([a, b, top[1], top[0]])} fill={color} />
      <polygon
        points={points([b, c, top[2], top[1]])}
        fill={color}
        style={{ filter: 'brightness(.75)' }}
      />
      <polygon points={points([e, c, top[2], top[3]])} fill={color} />
      <polygon points={points(top)} fill={color} style={{ filter: 'brightness(1.16)' }} />
    </g>
  )
}

function Pick({
  name,
  label,
  selected,
  onSelect,
  children,
}: {
  name: string
  label: string
  selected: string
  onSelect: (tag: string) => void
  children: ReactNode
}) {
  const key = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(name)
    }
  }
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected === name}
      onClick={() => onSelect(name)}
      onKeyDown={key}
      className={selected === name ? 'cell-part selected' : 'cell-part'}
    >
      {children}
    </g>
  )
}

export function CellScene({
  state,
  ghost,
  selected,
  onSelect,
}: {
  state: SimulationState
  ghost?: SimulationState
  selected: string
  onSelect: (tag: string) => void
}) {
  const conveyor = Boolean(state.tags.MTR_CONV_RUN.value)
  const gate = Boolean(state.tags.CYL_REJECT_EXT.value)
  return (
    <svg
      className="cell-scene"
      viewBox="0 0 1080 480"
      role="group"
      aria-label="Interactive isometric packaging cell"
    >
      <defs>
        <pattern
          id="floor-grid"
          width="32"
          height="32"
          patternUnits="userSpaceOnUse"
          patternTransform="skewY(-6)"
        >
          <path d="M32 0H0V32" fill="none" stroke="#32403b" strokeWidth=".55" />
        </pattern>
        <radialGradient id="cell-glow">
          <stop stopColor="#32463c" />
          <stop offset="1" stopColor="#18221f" />
        </radialGradient>
      </defs>
      <rect width="1080" height="480" rx="14" fill="url(#cell-glow)" />
      <rect x="20" y="90" width="1040" height="365" fill="url(#floor-grid)" opacity=".65" />
      <text x="30" y="34" className="scene-label">
        CELL 01 / PACKAGING
      </text>
      <text x="30" y="55" className="scene-muted">
        Select a station to inspect its live signal
      </text>
      <text x="830" y="34" className="scene-label">
        {conveyor ? '● CONVEYOR RUNNING' : '○ CONVEYOR HELD'}
      </text>

      {[30, 310, 610].map((x) => (
        <g key={x}>
          <Box x={x} y={10} w={18} d={18} h={-72} color="#6c7770" />
          <Box x={x} y={114} w={18} d={18} h={-72} color="#6c7770" />
        </g>
      ))}
      <Pick
        name="MTR_CONV_RUN"
        label="Inspect conveyor motor"
        selected={selected}
        onSelect={onSelect}
      >
        <Box x={0} y={0} w={720} d={145} h={12} color="#77867e" />
        <polygon
          points={points([
            project(8, 12, 14),
            project(710, 12, 14),
            project(710, 130, 14),
            project(8, 130, 14),
          ])}
          fill="#2c3532"
          stroke="#91a297"
        />
        {Array.from({ length: 29 }, (_, i) => {
          const x = (i * 25 + (conveyor ? state.elapsedMs / 45 : 0)) % 710
          const a = project(x, 14, 15)
          const b = project(x, 129, 15)
          return (
            <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#68756c" opacity=".65" />
          )
        })}
        <Box x={45} y={-42} w={88} d={36} h={34} color={conveyor ? '#d7e5ad' : '#7b8881'} />
      </Pick>

      <Pick
        name="PE_INSPECTION_PRESENT"
        label="Inspect optical inspection station"
        selected={selected}
        onSelect={onSelect}
      >
        <Box x={335} y={5} w={18} d={20} h={116} color="#d4d8ce" />
        <Box x={335} y={126} w={18} d={20} h={116} color="#d4d8ce" />
        <Box x={333} y={2} w={24} d={145} h={12} z={113} color="#a7b6a8" />
        <Box x={321} y={52} w={50} d={42} h={18} z={122} color="#d3ed9b" />
        <polygon
          points={points([project(342, 67, 100), project(320, 25, 17), project(372, 115, 17)])}
          fill={state.tags.PE_INSPECTION_PRESENT.value ? '#cfe986' : '#718753'}
          opacity={state.tags.PE_INSPECTION_PRESENT.value ? '.3' : '.08'}
        />
      </Pick>

      <Pick
        name="CYL_REJECT_EXT"
        label="Inspect reject diverter"
        selected={selected}
        onSelect={onSelect}
      >
        <Box x={484} y={-133} w={110} d={140} h={-12} color="#ac8955" />
        <Box
          x={505}
          y={gate ? 15 : 125}
          w={22}
          d={gate ? 120 : 20}
          h={46}
          color={gate ? '#f0ba56' : '#b7c0b4'}
        />
        <Box x={506} y={148} w={30} d={54} h={38} color="#ccbca0" />
      </Pick>

      {[
        { x: 64, tag: 'PE_INFEED_BLOCKED', label: 'Inspect infeed sensor' },
        { x: 656, tag: 'PE_EXIT_BLOCKED', label: 'Inspect discharge sensor' },
      ].map(({ x, tag, label }) => (
        <Pick key={tag} name={tag} label={label} selected={selected} onSelect={onSelect}>
          <Box
            x={x}
            y={-7}
            w={16}
            d={16}
            h={40}
            color={state.tags[tag].value ? '#d7ed9c' : '#839689'}
          />
          <line
            x1={project(x + 8, 0, 25)[0]}
            y1={project(x + 8, 0, 25)[1]}
            x2={project(x + 8, 145, 25)[0]}
            y2={project(x + 8, 145, 25)[1]}
            stroke="#d7ed9c"
            strokeDasharray="4 5"
            opacity=".6"
          />
        </Pick>
      ))}

      {ghost?.packages.map((item) => (
        <g key={`ghost-${item.id}`} className="ghost-package">
          <Box x={item.position * 6.8} y={48} w={27} d={42} h={55} color="#b7c3fb" opacity={0.25} />
        </g>
      ))}
      {state.packages.map((item) => (
        <g key={item.id}>
          <Box
            x={item.position * 6.8}
            y={48}
            w={27}
            d={42}
            h={42}
            color={item.inspected ? (item.reject ? '#ee9863' : '#d4e9a3') : '#bda17b'}
          />
          <text
            x={project(item.position * 6.8 + 6, 45, 24)[0]}
            y={project(item.position * 6.8 + 6, 45, 24)[1]}
            fill="#22302a"
            fontSize="10"
          >
            {item.id}
          </text>
        </g>
      ))}

      {[
        { x: 70, y: 185, title: '01 INFEED', sub: 'PHOTOEYE' },
        {
          x: 340,
          y: 220,
          title: '02 INSPECT',
          sub: state.scenario.inspectionMode === 'external' ? 'EXTERNAL EVENTS' : 'SEEDED MODEL',
        },
        { x: 530, y: -170, title: '03 DIVERT', sub: 'QUALITY CONTAINMENT' },
        { x: 660, y: 172, title: '04 DISCHARGE', sub: 'ACCEPTED PARTS' },
      ].map(({ x, y, title, sub }) => (
        <g key={title}>
          <text x={project(x, y)[0]} y={project(x, y)[1]} className="scene-label">
            {title}
          </text>
          <text x={project(x, y)[0]} y={project(x, y)[1] + 17} className="scene-muted">
            {sub}
          </text>
        </g>
      ))}
      <g transform="translate(30 423)">
        <circle r="4" fill="#bda17b" />
        <text x="12" y="4" className="scene-muted">
          Awaiting inspection
        </text>
        <circle cx="178" r="4" fill="#d4e9a3" />
        <text x="190" y="4" className="scene-muted">
          Accepted
        </text>
        <circle cx="280" r="4" fill="#ee9863" />
        <text x="292" y="4" className="scene-muted">
          Reject
        </text>
        {ghost ? (
          <>
            <circle cx="370" r="4" fill="#b7c3fb" />
            <text x="382" y="4" className="scene-muted">
              Baseline ghost
            </text>
          </>
        ) : null}
      </g>
    </svg>
  )
}
