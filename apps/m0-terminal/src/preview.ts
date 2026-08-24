import type { BehaviorGuidance } from '@companion-preference/contracts'

import type { Preview } from './types.js'

/** Pure, fixed-template projection. These strings are deliberately not model output. */
export function renderDeterministicPreview(
  guidance: Readonly<BehaviorGuidance>,
): Preview {
  if (guidance.responseDetail === 'concise') {
    return {
      mode: 'concise',
      label: 'Deterministic preview',
      text: 'Next step: run the focused check, then review the result.',
    }
  }
  return {
    mode: 'baseline',
    label: 'Deterministic preview',
    text: 'I can outline the work, explain key trade-offs, and suggest a next step.',
  }
}
