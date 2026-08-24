import { PassThrough, Writable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { runGuidedWalkthrough } from './index.js'

async function runScriptedWalkthrough(commands: readonly string[]): Promise<{
  exitCode: 0 | 1
  transcript: string
}> {
  const input = new PassThrough()
  const chunks: string[] = []
  let nextCommand = 0
  const output = new Writable({
    write(chunk, _encoding, callback) {
      const text = chunk.toString()
      chunks.push(text)
      if (text.includes('> ') && nextCommand < commands.length) {
        const command = commands[nextCommand++]
        queueMicrotask(() => input.write(`${command}\n`))
      }
      callback()
    },
  })

  const exitCode = await runGuidedWalkthrough({ input, output })
  input.end()
  output.end()
  return { exitCode, transcript: chunks.join('') }
}

describe('runGuidedWalkthrough high-tier transcript oracle', () => {
  it('shows baseline before confirmation, concise after confirmation, and baseline after revocation', async () => {
    const { exitCode, transcript } = await runScriptedWalkthrough(['c', 'u'])
    const baseline = 'Deterministic preview: baseline — I can outline the work, explain key trade-offs, and suggest a next step.'
    const concise = 'Deterministic preview: concise — Next step: run the focused check, then review the result.'

    expect(exitCode).toBe(0)
    expect(transcript.match(/Deterministic preview: baseline —/g) ?? []).toHaveLength(2)
    expect(transcript.match(/Deterministic preview: concise —/g) ?? []).toHaveLength(1)
    expect(transcript).toContain('工作域 guidance：responseDetail=concise')
    expect(transcript).toContain('陪伴域：未生效（privacy-domain-mismatch）')
    expect(transcript).toContain('已撤销；工作域 guidance：空（inactive-status）')

    const baselineBeforeConfirmation = transcript.indexOf(baseline)
    const confirmationPrompt = transcript.indexOf('[c] 确认')
    const appliedGuidance = transcript.indexOf('工作域 guidance：responseDetail=concise')
    const conciseAfterConfirmation = transcript.indexOf(concise)
    const isolatedCompanion = transcript.indexOf('陪伴域：未生效（privacy-domain-mismatch）')
    const revocationPrompt = transcript.indexOf('[u] 撤销')
    const revokedGuidance = transcript.indexOf('已撤销；工作域 guidance：空（inactive-status）')
    const baselineAfterRevocation = transcript.lastIndexOf(baseline)

    expect(baselineBeforeConfirmation).toBeGreaterThanOrEqual(0)
    expect(baselineBeforeConfirmation).toBeLessThan(confirmationPrompt)
    expect(confirmationPrompt).toBeLessThan(appliedGuidance)
    expect(appliedGuidance).toBeLessThan(conciseAfterConfirmation)
    expect(conciseAfterConfirmation).toBeLessThan(isolatedCompanion)
    expect(isolatedCompanion).toBeLessThan(revocationPrompt)
    expect(revocationPrompt).toBeLessThan(revokedGuidance)
    expect(revokedGuidance).toBeLessThan(baselineAfterRevocation)
  })

  it('consumes a buffered walkthrough without dropping answers between prompts', async () => {
    const input = new PassThrough()
    const chunks: string[] = []
    const output = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString())
        callback()
      },
    })
    input.end('c\nu\n')

    await expect(runGuidedWalkthrough({ input, output })).resolves.toBe(0)
    expect(chunks.join('')).toContain('已撤销；工作域 guidance：空（inactive-status）')
    expect(chunks.join('')).toContain('演练完成')
  })

  it('treats immediate EOF as a clean exit', async () => {
    const input = new PassThrough()
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    })
    input.end()

    await expect(runGuidedWalkthrough({ input, output })).resolves.toBe(0)
  })
})
