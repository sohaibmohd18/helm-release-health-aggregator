import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Suppress "act(...)" warnings from async state updates in TanStack Query
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Recharts uses ResizeObserver for ResponsiveContainer — jsdom doesn't have it
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// EventsPage calls scrollTo on a div ref — jsdom doesn't implement it
window.HTMLElement.prototype.scrollTo = vi.fn()

// matchMedia is not implemented in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
