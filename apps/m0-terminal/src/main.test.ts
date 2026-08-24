import { describe, expect, it } from 'vitest'

import { createM0ExperienceSession } from './create-session.js'
import { runTerminal } from './main.js'

async function* scriptedInput(): AsyncGenerator<string> {
  yield 'show'
  yield 'next'
  yield 'confirm m0-candidate-work-concise'
  yield 'show'
  yield 'revoke m0-preference-work-concise'
  yield 'show'
  yield 'exit'
}

describe('runTerminal', () => {
  it('uses the same session path for a clean scripted walkthrough with no persistent side effect', async () => {
    const output: string[] = []
    const exitCode = await runTerminal(scriptedInput(), { write: (text) => output.push(text) }, createM0ExperienceSession())
    const transcript = output.join('')

    expect(exitCode).toBe(0)
    expect(transcript).toContain('Deterministic preview')
    expect(transcript.indexOf('baseline')).toBeLessThan(transcript.indexOf('m0-candidate-work-concise'))
    expect(transcript.indexOf('m0-candidate-work-concise')).toBeLessThan(transcript.indexOf('concise'))
    expect(transcript.lastIndexOf('baseline')).toBeGreaterThan(transcript.indexOf('concise'))
  })
})
