import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { WineDetailProvider, useWineDetail } from './WineDetailContext'

function wrapper({ children }: { children: ReactNode }) {
  return <WineDetailProvider>{children}</WineDetailProvider>
}

describe('useWineDetail', () => {
  it('throws when used outside provider', () => {
    expect(() => renderHook(() => useWineDetail())).toThrow(
      'useWineDetail must be used inside WineDetailProvider',
    )
  })

  it('initializes selectedSku as null', () => {
    const { result } = renderHook(() => useWineDetail(), { wrapper })
    expect(result.current.selectedSku).toBeNull()
  })

  it('updates selectedSku via setter', () => {
    const { result } = renderHook(() => useWineDetail(), { wrapper })

    act(() => result.current.setSelectedSku('00123456'))
    expect(result.current.selectedSku).toBe('00123456')

    act(() => result.current.setSelectedSku(null))
    expect(result.current.selectedSku).toBeNull()
  })
})
