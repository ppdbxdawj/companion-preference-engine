export type BackgroundBurden = Readonly<{
  backgroundTurnCount: number
  candidateCount: number
  candidatesPer20Turns: number
}>

/** Measures unnecessary candidate prompts on ordinary turns only. */
export function scoreBackgroundBurden(
  backgroundTurnCount: number,
  candidateCount: number,
): BackgroundBurden {
  if (!Number.isInteger(backgroundTurnCount) || backgroundTurnCount <= 0) {
    throw new Error('background turn count must be positive')
  }
  if (!Number.isInteger(candidateCount) || candidateCount < 0) {
    throw new Error('background candidate count must be non-negative')
  }
  return {
    backgroundTurnCount,
    candidateCount,
    candidatesPer20Turns: candidateCount * 20 / backgroundTurnCount,
  }
}
