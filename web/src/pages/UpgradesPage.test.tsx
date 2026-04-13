import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils'
import UpgradesPage from './UpgradesPage'
import { mockUpgradeCandidates } from '@/api/mock'
import { useUpgrades } from '@/api/client'

vi.mock('@/api/client', () => ({
  useUpgrades: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(useUpgrades).mockReturnValue({ data: mockUpgradeCandidates, isLoading: false })
})

describe('UpgradesPage — sections', () => {
  it('renders the page heading', () => {
    renderWithProviders(<UpgradesPage />)
    expect(screen.getByText('Upgrade Advisor')).toBeInTheDocument()
  })

  it('shows Major upgrades section', async () => {
    renderWithProviders(<UpgradesPage />)
    await waitFor(() => {
      expect(screen.getByText('Major upgrades')).toBeInTheDocument()
    })
  })

  it('shows Minor upgrades section', async () => {
    renderWithProviders(<UpgradesPage />)
    await waitFor(() => {
      expect(screen.getByText('Minor upgrades')).toBeInTheDocument()
    })
  })

  it('shows Patch upgrades section', async () => {
    renderWithProviders(<UpgradesPage />)
    await waitFor(() => {
      expect(screen.getByText('Patch upgrades')).toBeInTheDocument()
    })
  })

  it('shows the correct total pending count', async () => {
    renderWithProviders(<UpgradesPage />)
    await waitFor(() => {
      // "10 total pending" is split across elements (<span>10</span> total pending)
      const el = screen.getByText((_, node) => {
        const text = node?.textContent ?? ''
        return text === `${mockUpgradeCandidates.length} total pending`
      })
      expect(el).toBeInTheDocument()
    })
  })

  it('collapses section on header click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<UpgradesPage />)
    await waitFor(() => screen.getByText('Major upgrades'))
    const majorRelease = mockUpgradeCandidates.find(
      c => c.release.versionStatus.severity === 'major',
    )!
    expect(screen.getByText(majorRelease.release.name)).toBeInTheDocument()
    await user.click(screen.getByText('Major upgrades'))
    await waitFor(() => {
      expect(screen.queryByText(majorRelease.release.name)).not.toBeInTheDocument()
    })
  })
})

describe('UpgradesPage — empty state', () => {
  it('shows "All releases up to date" when no candidates', () => {
    vi.mocked(useUpgrades).mockReturnValue({ data: [], isLoading: false })
    renderWithProviders(<UpgradesPage />)
    expect(screen.getByText('All releases up to date')).toBeInTheDocument()
  })
})

describe('UpgradesPage — skeleton', () => {
  it('renders heading while loading', () => {
    vi.mocked(useUpgrades).mockReturnValue({ data: undefined, isLoading: true })
    renderWithProviders(<UpgradesPage />)
    expect(screen.getByText('Upgrade Advisor')).toBeInTheDocument()
  })
})
