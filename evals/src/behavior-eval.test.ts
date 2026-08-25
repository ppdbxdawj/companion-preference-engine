import { describe, expect, it } from 'vitest'

import { scoreBackgroundBurden } from './behavior-eval.js'

describe('background behavior evaluation', () => {
  it('reports candidate burden separately from the quality set', () => {
    expect(scoreBackgroundBurden(100, 5)).toEqual({
      backgroundTurnCount: 100,
      candidateCount: 5,
      candidatesPer20Turns: 1,
    })
  })

  it('rejects invalid denominators and negative candidates', () => {
    expect(() => scoreBackgroundBurden(0, 0)).toThrow(/turn count/i)
    expect(() => scoreBackgroundBurden(100, -1)).toThrow(/candidate/i)
  })
})
