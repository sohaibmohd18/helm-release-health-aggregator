import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UpgradeBadge } from './UpgradeBadge'

describe('UpgradeBadge', () => {
  it('renders "Current" for none', () => {
    render(<UpgradeBadge severity="none" />)
    expect(screen.getByText('Current')).toBeInTheDocument()
  })

  it('renders "Patch" for patch', () => {
    render(<UpgradeBadge severity="patch" />)
    expect(screen.getByText('Patch')).toBeInTheDocument()
  })

  it('renders "Minor" for minor', () => {
    render(<UpgradeBadge severity="minor" />)
    expect(screen.getByText('Minor')).toBeInTheDocument()
  })

  it('renders "Major" for major', () => {
    render(<UpgradeBadge severity="major" />)
    expect(screen.getByText('Major')).toBeInTheDocument()
  })

  it('applies green class for none', () => {
    render(<UpgradeBadge severity="none" />)
    expect(screen.getByText('Current').className).toContain('green')
  })

  it('applies red class for major', () => {
    render(<UpgradeBadge severity="major" />)
    expect(screen.getByText('Major').className).toContain('red')
  })

  it('applies blue class for patch', () => {
    render(<UpgradeBadge severity="patch" />)
    expect(screen.getByText('Patch').className).toContain('blue')
  })
})
