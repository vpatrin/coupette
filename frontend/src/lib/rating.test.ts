import { describe, it, expect } from 'vitest'
import { ratingColor, getBucket, BUCKETS } from './rating'

describe('ratingColor', () => {
  it('returns green for 97+', () => {
    expect(ratingColor(97)).toBe('#4ade80')
    expect(ratingColor(100)).toBe('#4ade80')
  })

  it('returns lime for 90-96', () => {
    expect(ratingColor(90)).toBe('#a3e635')
    expect(ratingColor(96)).toBe('#a3e635')
  })

  it('returns amber for 80-89', () => {
    expect(ratingColor(80)).toBe('#fbbf24')
    expect(ratingColor(89)).toBe('#fbbf24')
  })

  it('returns orange for 70-79', () => {
    expect(ratingColor(70)).toBe('#fb923c')
    expect(ratingColor(79)).toBe('#fb923c')
  })

  it('returns red for < 70', () => {
    expect(ratingColor(69)).toBe('#f87171')
    expect(ratingColor(0)).toBe('#f87171')
  })
})

describe('getBucket', () => {
  it('returns correct bucket for each boundary', () => {
    expect(getBucket(0).stars).toBe('★1.0–1.4')
    expect(getBucket(59).stars).toBe('★1.0–1.4')
    expect(getBucket(60).stars).toBe('★1.5–1.9')
    expect(getBucket(85).stars).toBe('★3.5–3.9')
    expect(getBucket(90).stars).toBe('★4.0–4.2')
    expect(getBucket(100).stars).toBe('★5.0')
  })

  it('falls back to first bucket for out-of-range values', () => {
    expect(getBucket(-1)).toBe(BUCKETS[0])
  })

  it('buckets cover 0-100 without gaps', () => {
    for (let i = 0; i <= 100; i++) {
      const bucket = getBucket(i)
      expect(bucket.min).toBeLessThanOrEqual(i)
      expect(bucket.max).toBeGreaterThanOrEqual(i)
    }
  })
})
