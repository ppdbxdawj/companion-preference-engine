import { describe, expect, it } from 'vitest'

import { renderDeterministicPreview } from './preview.js'

describe('renderDeterministicPreview', () => {
  it('marks an empty guidance result as a deterministic baseline rather than a model response', () => {
    expect(renderDeterministicPreview({})).toEqual({
      mode: 'baseline',
      label: 'Deterministic preview',
      text: 'I can outline the work, explain key trade-offs, and suggest a next step.',
    })
  })

  it('changes only the frozen response-detail signal to the concise template', () => {
    expect(renderDeterministicPreview({ responseDetail: 'concise' })).toEqual({
      mode: 'concise',
      label: 'Deterministic preview',
      text: 'Next step: run the focused check, then review the result.',
    })
  })
})
