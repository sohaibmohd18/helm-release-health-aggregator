import { type ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

interface WrapperProps {
  children: ReactNode
  initialEntries?: string[]
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  })
}

export function TestProviders({ children, initialEntries = ['/'] }: WrapperProps) {
  const queryClient = createTestQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[]
}

export function renderWithProviders(
  ui: ReactNode,
  { initialEntries, ...options }: CustomRenderOptions = {},
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <TestProviders initialEntries={initialEntries}>{children}</TestProviders>
    ),
    ...options,
  })
}
