import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '@/test/utils'
import ReleaseDetailPage from './ReleaseDetailPage'
import { mockReleaseDetails } from '@/api/mock'
import { useRelease } from '@/api/client'

const grafanaDetail = mockReleaseDetails['monitoring/grafana']
const trustManagerDetail = mockReleaseDetails['cert-manager/trust-manager']

vi.mock('@/api/client', () => ({
  useRelease: vi.fn(),
}))

// Render ReleaseDetailPage inside a Route so useParams() works
function renderDetail(path: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/releases/:namespace/:name" element={<ReleaseDetailPage />} />
    </Routes>,
    { initialEntries: [path] },
  )
}

beforeEach(() => {
  vi.mocked(useRelease).mockImplementation((namespace: string, name: string) => {
    const id = `${namespace}/${name}`
    const detail =
      ({ 'monitoring/grafana': grafanaDetail, 'cert-manager/trust-manager': trustManagerDetail } as Record<
        string,
        typeof grafanaDetail
      >)[id]
    return { data: detail, isLoading: false, isError: !detail }
  })
})

describe('ReleaseDetailPage — header', () => {
  it('renders release name', async () => {
    renderDetail('/releases/monitoring/grafana')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'grafana' })).toBeInTheDocument()
    })
  })

  it('renders namespace badge', async () => {
    renderDetail('/releases/monitoring/grafana')
    await waitFor(() => {
      expect(screen.getAllByText('monitoring').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders breadcrumb link to releases', async () => {
    renderDetail('/releases/monitoring/grafana')
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Releases' })).toBeInTheDocument()
    })
  })
})

describe('ReleaseDetailPage — tabs', () => {
  it('renders all four tabs', async () => {
    renderDetail('/releases/monitoring/grafana')
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Overview/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Values Drift/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Version History/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Upgrade Advisor/ })).toBeInTheDocument()
    })
  })

  it('Overview tab is active by default and shows pods', async () => {
    renderDetail('/releases/monitoring/grafana')
    await waitFor(() => {
      expect(screen.getByText(/Pods/)).toBeInTheDocument()
    })
  })

  it('switching to Values Drift tab shows drift content for release with drift', async () => {
    const user = userEvent.setup()
    renderDetail('/releases/monitoring/grafana')
    await waitFor(() => screen.getByRole('tab', { name: /Values Drift/ }))
    await user.click(screen.getByRole('tab', { name: /Values Drift/ }))
    await waitFor(() => {
      expect(screen.getByText(/differ from chart defaults/)).toBeInTheDocument()
    })
  })

  it('Values Drift tab shows "No drift detected" for trust-manager', async () => {
    const user = userEvent.setup()
    renderDetail('/releases/cert-manager/trust-manager')
    await waitFor(() => screen.getByRole('tab', { name: /Values Drift/ }))
    await user.click(screen.getByRole('tab', { name: /Values Drift/ }))
    await waitFor(() => {
      expect(screen.getByText('No drift detected')).toBeInTheDocument()
    })
  })

  it('switching to Version History tab shows revisions', async () => {
    const user = userEvent.setup()
    renderDetail('/releases/monitoring/grafana')
    await waitFor(() => screen.getByRole('tab', { name: /Version History/ }))
    await user.click(screen.getByRole('tab', { name: /Version History/ }))
    await waitFor(() => {
      expect(screen.getAllByText(/Revision \d+/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('switching to Upgrade Advisor shows "Up to date" for trust-manager', async () => {
    const user = userEvent.setup()
    renderDetail('/releases/cert-manager/trust-manager')
    await waitFor(() => screen.getByRole('tab', { name: /Upgrade Advisor/ }))
    await user.click(screen.getByRole('tab', { name: /Upgrade Advisor/ }))
    await waitFor(() => {
      expect(screen.getByText('Up to date')).toBeInTheDocument()
    })
  })
})

describe('ReleaseDetailPage — not found', () => {
  it('shows not found state for unknown release', async () => {
    renderDetail('/releases/default/nonexistent')
    await waitFor(() => {
      expect(screen.getByText('Release not found')).toBeInTheDocument()
    })
  })
})
