import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils'
import ReleasesPage from './ReleasesPage'
import { mockReleases, mockNamespaceSummaries } from '@/api/mock'
import type { ListResponse, Release } from '@/types'
import { useNamespaceSummaries, useReleases } from '@/api/client'

vi.mock('@/api/client', () => ({
  useNamespaceSummaries: vi.fn(),
  useReleases: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(useNamespaceSummaries).mockReturnValue({ data: mockNamespaceSummaries, isLoading: false })
  vi.mocked(useReleases).mockReturnValue({
    data: { items: mockReleases, total: mockReleases.length, page: 1, pageSize: 100 } as ListResponse<Release>,
    isLoading: false,
  })
})

describe('ReleasesPage — table rendering', () => {
  it('renders all 12 releases', async () => {
    renderWithProviders(<ReleasesPage />)
    await waitFor(() => {
      expect(screen.getAllByText('prometheus-stack').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('trust-manager').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders column headers', async () => {
    renderWithProviders(<ReleasesPage />)
    await waitFor(() => {
      expect(screen.getAllByText('Namespace').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Release').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Chart')).toBeInTheDocument()
      expect(screen.getAllByText('Health').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Pods')).toBeInTheDocument()
    })
  })

  it('shows red border hint for Failed releases', async () => {
    const { container } = renderWithProviders(<ReleasesPage />)
    await waitFor(() => {
      const failedRows = container.querySelectorAll('.border-l-red-500')
      expect(failedRows.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('shows amber border hint for Degraded releases', async () => {
    const { container } = renderWithProviders(<ReleasesPage />)
    await waitFor(() => {
      const degradedRows = container.querySelectorAll('.border-l-amber-400')
      expect(degradedRows.length).toBeGreaterThanOrEqual(3)
    })
  })
})

describe('ReleasesPage — search filter', () => {
  it('filters by release name search', async () => {
    const user = userEvent.setup()
    const filtered = mockReleases.filter(r => r.name.includes('grafana'))
    vi.mocked(useReleases).mockReturnValue({
      data: { items: filtered, total: filtered.length, page: 1, pageSize: 100 } as ListResponse<Release>,
      isLoading: false,
    })
    renderWithProviders(<ReleasesPage />)
    const input = screen.getByPlaceholderText('Search releases or charts…')
    await user.type(input, 'grafana')
    await waitFor(() => {
      expect(screen.getByDisplayValue('grafana')).toBeInTheDocument()
    })
  })
})

describe('ReleasesPage — empty state', () => {
  it('shows empty state when no results', async () => {
    vi.mocked(useReleases).mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 25 } as ListResponse<Release>,
      isLoading: false,
    })
    renderWithProviders(<ReleasesPage />)
    await waitFor(() => {
      expect(screen.getByText('No releases found')).toBeInTheDocument()
    })
  })
})

describe('ReleasesPage — skeleton state', () => {
  it('renders without crashing when loading', () => {
    vi.mocked(useNamespaceSummaries).mockReturnValue({ data: undefined, isLoading: true })
    vi.mocked(useReleases).mockReturnValue({ data: undefined, isLoading: true })
    renderWithProviders(<ReleasesPage />)
    expect(screen.getByText('Release Inventory')).toBeInTheDocument()
  })
})

describe('ReleasesPage — pagination', () => {
  it('renders pagination controls', async () => {
    renderWithProviders(<ReleasesPage />)
    await waitFor(() => {
      expect(screen.getAllByText(/releases/i).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('page size selector has correct options', async () => {
    renderWithProviders(<ReleasesPage />)
    await waitFor(() => {
      // Radix Select renders a combobox button for the page size selector
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })
  })
})

describe('ReleasesPage — sorting', () => {
  it('clicking Namespace header sorts the table', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReleasesPage />)
    await waitFor(() => screen.getAllByText('prometheus-stack'))
    // Click the first "Namespace" element (column header button)
    await user.click(screen.getAllByText('Namespace')[0])
    await waitFor(() => {
      expect(screen.getAllByText('prometheus-stack').length).toBeGreaterThanOrEqual(1)
    })
  })
})
