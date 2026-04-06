import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '@/contexts/AuthContext'
const mockUseAuth = vi.mocked(useAuth)

beforeEach(() => {
  localStorage.clear()
})

function renderProtected() {
  return render(
    <MemoryRouter>
      <ProtectedRoute>
        <div data-testid="protected-content">Secret</div>
      </ProtectedRoute>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  it('redirects to / when not authenticated', () => {
    mockUseAuth.mockReturnValue({ token: null } as ReturnType<typeof useAuth>)
    renderProtected()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('redirects to /onboarding when not onboarded', () => {
    mockUseAuth.mockReturnValue({ token: 'jwt.token.here' } as ReturnType<typeof useAuth>)
    // No 'onboarded' in localStorage
    renderProtected()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('renders children when authenticated and onboarded', () => {
    mockUseAuth.mockReturnValue({ token: 'jwt.token.here' } as ReturnType<typeof useAuth>)
    localStorage.setItem('onboarded', '1')
    renderProtected()
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })
})
