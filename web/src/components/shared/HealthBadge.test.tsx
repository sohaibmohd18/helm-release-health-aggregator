import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HealthBadge } from './HealthBadge'

describe('HealthBadge', () => {
  it('renders Healthy', () => {
    render(<HealthBadge health="Healthy" />)
    expect(screen.getByText('Healthy')).toBeInTheDocument()
  })

  it('renders Degraded', () => {
    render(<HealthBadge health="Degraded" />)
    expect(screen.getByText('Degraded')).toBeInTheDocument()
  })

  it('renders Failed', () => {
    render(<HealthBadge health="Failed" />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('renders Unknown', () => {
    render(<HealthBadge health="Unknown" />)
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('applies green class for Healthy', () => {
    render(<HealthBadge health="Healthy" />)
    expect(screen.getByText('Healthy').className).toContain('green')
  })

  it('applies red class for Failed', () => {
    render(<HealthBadge health="Failed" />)
    expect(screen.getByText('Failed').className).toContain('red')
  })

  it('applies amber class for Degraded', () => {
    render(<HealthBadge health="Degraded" />)
    expect(screen.getByText('Degraded').className).toContain('amber')
  })

  it('applies gray class for Unknown', () => {
    render(<HealthBadge health="Unknown" />)
    expect(screen.getByText('Unknown').className).toContain('gray')
  })

  it('forwards additional className', () => {
    render(<HealthBadge health="Healthy" className="test-class" />)
    expect(screen.getByText('Healthy').className).toContain('test-class')
  })
})
