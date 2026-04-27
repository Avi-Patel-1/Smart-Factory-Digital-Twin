import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from '../App'

describe('application smoke test', () => {
  it('renders the dashboard shell and primary navigation', () => {
    const html = renderToString(<App />)
    expect(html).toContain('Smart Factory Digital Twin')
    expect(html).toContain('HMI Overview')
    expect(html).toContain('Production Report')
  })
})
