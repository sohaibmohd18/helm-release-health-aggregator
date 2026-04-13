import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { mockClusterSummary, mockNamespaceSummaries, mockReleases, mockUpgradeCandidates, mockEvents } from '@/api/mock'
import type { ListResponse, Release } from '@/types'
import {
  useClusterSummary,
  useNamespaceSummaries,
  useReleases,
  useUpgrades,
  useEvents,
} from '@/api/client'

// Mock all API hooks
vi.mock('@/api/client', () => ({
  useClusterSummary: vi.fn(),
  useNamespaceSummaries: vi.fn(),
  useReleases: vi.fn(),
  useUpgrades: vi.fn(),
  useEvents: vi.fn(),
}))

// Mock useEventsFeed to avoid setInterval in tests
vi.mock('@/hooks/useEventsFeed', () => ({
  useEventsFeed: () => ({ events: mockEvents, connected: true, clearEvents: vi.fn() }),
}))

import OverviewPage from '@/pages/OverviewPage'
import ReleasesPage from '@/pages/ReleasesPage'
import UpgradesPage from '@/pages/UpgradesPage'
import EventsPage from '@/pages/EventsPage'
import { Layout } from '@/components/layout/Layout'

beforeEach(() => {
  vi.mocked(useClusterSummary).mockReturnValue({ data: mockClusterSummary, isLoading: false })
  vi.mocked(useNamespaceSummaries).mockReturnValue({ data: mockNamespaceSummaries, isLoading: false })
  vi.mocked(useReleases).mockReturnValue({
    data: { items: mockReleases, total: mockReleases.length, page: 1, pageSize: 100 } as ListResponse<Release>,
    isLoading: false,
  })
  vi.mocked(useUpgrades).mockReturnValue({ data: mockUpgradeCandidates, isLoading: false })
  vi.mocked(useEvents).mockReturnValue({ data: mockEvents, isLoading: false })
})

function AppWithLayout({ initialEntries = ['/'] }: { initialEntries?: string[] }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <Layout>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/releases" element={<ReleasesPage />} />
            <Route path="/upgrades" element={<UpgradesPage />} />
            <Route path="/events" element={<EventsPage />} />
          </Routes>
        </Layout>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Navigation — sidebar links', () => {
  it('starts on Overview page', async () => {
    render(<AppWithLayout />)
    await waitFor(() => {
      // Header h2 + OverviewPage h1 both show "Cluster Overview"
      expect(screen.getAllByText('Cluster Overview').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('navigates to Releases via sidebar', async () => {
    const user = userEvent.setup()
    render(<AppWithLayout />)
    await waitFor(() => screen.getByRole('link', { name: /Releases/ }))
    await user.click(screen.getByRole('link', { name: /Releases/ }))
    await waitFor(() => {
      expect(screen.getAllByText('Release Inventory').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('navigates to Upgrades via sidebar', async () => {
    const user = userEvent.setup()
    render(<AppWithLayout />)
    await waitFor(() => screen.getByRole('link', { name: /Upgrades/ }))
    await user.click(screen.getByRole('link', { name: /Upgrades/ }))
    await waitFor(() => {
      expect(screen.getAllByText('Upgrade Advisor').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('navigates to Events via sidebar', async () => {
    const user = userEvent.setup()
    render(<AppWithLayout />)
    await waitFor(() => screen.getByRole('link', { name: /Events/ }))
    await user.click(screen.getByRole('link', { name: /Events/ }))
    await waitFor(() => {
      expect(screen.getAllByText('Live Events Feed').length).toBeGreaterThanOrEqual(1)
    })
  })
})

describe('Navigation — header page title', () => {
  it('shows "Cluster Overview" title on root route', async () => {
    render(<AppWithLayout initialEntries={['/']} />)
    await waitFor(() => {
      const headers = screen.getAllByText('Cluster Overview')
      expect(headers.length).toBeGreaterThanOrEqual(1)
    })
  })
})

describe('Dark mode toggle', () => {
  it('dark mode toggle button exists in header', async () => {
    render(<AppWithLayout />)
    await waitFor(() => {
      const btn = screen.getByTitle(/mode/)
      expect(btn).toBeInTheDocument()
    })
  })

  it('clicking dark mode toggle does not crash', async () => {
    const user = userEvent.setup()
    render(<AppWithLayout />)
    await waitFor(() => screen.getByTitle(/mode/))
    await user.click(screen.getByTitle(/mode/))
    expect(screen.getByText('HelmSight')).toBeInTheDocument()
  })
})
