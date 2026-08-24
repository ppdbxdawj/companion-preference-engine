import type { ParseResult, TerminalParseErrorCode } from './types.js'

/** Pure parser only. Command execution remains in main.ts. */
export function parseTerminalCommand(_input: string): ParseResult {
  const parts = _input.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { kind: 'parse-error', code: 'empty-command', message: '请输入命令。' }
  const [name, arg, extra] = parts
  const error = (code: TerminalParseErrorCode, message: string): ParseResult => ({ kind: 'parse-error', code, message })
  if (name === 'help' || name === 'show' || name === 'next' || name === 'reset' || name === 'exit') {
    return parts.length === 1 ? { kind: 'command', command: { type: name } } : error('unexpected-argument', `${name} 不接受参数。`)
  }
  if (name === 'confirm' || name === 'reject' || name === 'revoke') {
    if (!arg) return error('missing-argument', `${name} 缺少 ID。`)
    if (extra) return error('unexpected-argument', `${name} 只接受一个 ID。`)
    return { kind: 'command', command: name === 'revoke' ? { type: 'revoke', preferenceId: arg } : { type: name, candidateId: arg } }
  }
  if (name === 'domain') {
    if (!arg) return error('missing-argument', 'domain 缺少域名。')
    if (extra) return error('unexpected-argument', 'domain 只接受一个域名。')
    if (arg !== 'work' && arg !== 'companion') return error('invalid-domain', '域名只能是 work 或 companion。')
    return { kind: 'command', command: { type: 'domain', domain: arg } }
  }
  return error('unknown-command', `未知命令：${name}。`)
}
