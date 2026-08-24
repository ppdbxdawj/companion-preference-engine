import { describe, expect, it } from 'vitest'

import { parseTerminalCommand } from './command.js'

describe('parseTerminalCommand', () => {
  it('accepts exactly the frozen command grammar', () => {
    expect(parseTerminalCommand('help')).toEqual({ kind: 'command', command: { type: 'help' } })
    expect(parseTerminalCommand('show')).toEqual({ kind: 'command', command: { type: 'show' } })
    expect(parseTerminalCommand('next')).toEqual({ kind: 'command', command: { type: 'next' } })
    expect(parseTerminalCommand('confirm m0-candidate-work-concise')).toEqual({ kind: 'command', command: { type: 'confirm', candidateId: 'm0-candidate-work-concise' } })
    expect(parseTerminalCommand('reject m0-candidate-work-concise')).toEqual({ kind: 'command', command: { type: 'reject', candidateId: 'm0-candidate-work-concise' } })
    expect(parseTerminalCommand('revoke m0-preference-work-concise')).toEqual({ kind: 'command', command: { type: 'revoke', preferenceId: 'm0-preference-work-concise' } })
    expect(parseTerminalCommand('domain work')).toEqual({ kind: 'command', command: { type: 'domain', domain: 'work' } })
    expect(parseTerminalCommand('domain companion')).toEqual({ kind: 'command', command: { type: 'domain', domain: 'companion' } })
    expect(parseTerminalCommand('reset')).toEqual({ kind: 'command', command: { type: 'reset' } })
    expect(parseTerminalCommand('exit')).toEqual({ kind: 'command', command: { type: 'exit' } })
  })

  it('returns only local parse errors for unknown, incomplete, or over-specified input', () => {
    for (const input of ['', 'unknown', 'confirm', 'confirm a b', 'domain', 'domain other', 'show now']) {
      expect(parseTerminalCommand(input).kind).toBe('parse-error')
    }
  })
})
