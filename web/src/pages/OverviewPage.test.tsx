import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/test/utils'
import OverviewPage from './OverviewPage'
import { mockClusterSummary, mockNamespaceSummaries, mockReleases } from '@/api/mock'
import type { ListResponse, Release } from '@/types'
import { useClusterSummary, useNamespaceSummaries, useReleases } from '@/api/client'

vi.mock('@/api/client', () => ({
  useClusterSummary: vi.fn(),
  useNamespaceSummaries: vi.fn(),
  useReleases: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(useClusterSummary).mockReturnValue({ data: mockClusterSummary, isLoading: false })
  vi.mocked(useNamespaceSummaries).mockReturnValue({ data: mockNamespaceSummaries, isLoading: false })
  vi.mocked(useReleases).mockReturnValue({
    data: { items: mockReleases, total: mockReleases.length, page: 1, pageSize: 100 } as ListResponse<Release>,
    isLoading: false,
  })
})

describe('OverviewPage — metric cards', () => {
  beforeEach(() => {
    renderWithProviders(<OverviewPage />)
  })

  it('renders total releases count', async () => {
    await waitFor(() => {
      expect(screen.getByText(String(mockClusterSummary.totalReleases))).toBeInTheDocument()
    })
  })

  it('renders healthy releases count', async () => {
    await waitFor(() => {
      const els = screen.getAllByText(String(mockClusterSummary.healthyReleases))
      expect(els.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders upgrades available count', async () => {
    await waitFor(() => {
      expect(screen.getByText(String(mockClusterSummary.upgradesAvailable))).toBeInTheDocument()
    })
  })

  it('renders "Cluster Overview" heading', () => {
    expect(screen.getByText('Cluster Overview')).toBeInTheDocument()
  })

  it('renders "Releases by Namespace" chart section', () => {
    expect(screen.getByText('Releases by Namespace')).toBeInTheDocument()
  })

  it('renders "Health Distribution" chart section', () => {
    expect(screen.getByText('Health Distribution')).toBeInTheDocument()
  })

  it('renders "Needs Attention" panel', () => {
    expect(screen.getByText('Needs Attention')).toBeInTheDocument()
  })

  it('shows cluster name in stats bar', async () => {
    await waitFor(() => {
      expect(screen.getByText(mockClusterSummary.clusterName)).toBeInTheDocument()
    })
  })
})

describe('OverviewPage — loading skeletons', () => {
  it('renders heading while loading', () => {
    vi.mocked(useClusterSummary).mockReturnValue({ data: undefined, isLoading: true })
    vi.mocked(useNamespaceSummaries).mockReturnValue({ data: undefined, isLoading: true })
    vi.mocked(useReleases).mockReturnValue({ data: undefined, isLoading: true })
    renderWithProviders(<OverviewPage />)
    expect(screen.getByText('Cluster Overview')).toBeInTheDocument()
  })
})
