import { describe, expect, it } from 'vitest'

import { buildCodexExecRequest, CodexCliChatClient, type CodexExecRequest } from './codex-cli.js'

describe('isolated Codex CLI invocation', () => {
  it('uses stdin, an explicit model, an empty cwd, and no ambient Codex context', () => {
    expect(buildCodexExecRequest({
      executable: '/usr/local/bin/codex',
      model: 'explicit-test-model',
      prompt: 'Synthetic prompt containing $() and `backticks`.',
      workingDirectory: '/tmp/cpe-empty-run',
      outputSchemaPath: '/tmp/cpe-schema.json',
      outputPath: '/tmp/cpe-output.json',
    })).toEqual({
      executable: '/usr/local/bin/codex',
      args: [
        'exec',
        '--ephemeral',
        '--ignore-user-config',
        '--ignore-rules',
        '--sandbox',
        'read-only',
        '--skip-git-repo-check',
        '--model',
        'explicit-test-model',
        '--output-schema',
        '/tmp/cpe-schema.json',
        '--output-last-message',
        '/tmp/cpe-output.json',
        '-',
      ],
      cwd: '/tmp/cpe-empty-run',
      stdin: 'Synthetic prompt containing $() and `backticks`.',
      shell: false,
    })
  })

  it('rejects an absent or whitespace-only model ID', () => {
    expect(() => buildCodexExecRequest({
      executable: 'codex',
      model: '   ',
      prompt: 'Synthetic prompt.',
      workingDirectory: '/tmp/cpe-empty-run',
      outputSchemaPath: '/tmp/cpe-schema.json',
      outputPath: '/tmp/cpe-output.json',
    })).toThrow(/model/i)
  })

  it('parses only the structured final message and sends the prompt through stdin', async () => {
    const execute = async (request: CodexExecRequest, _signal: AbortSignal) => {
      expect(request.args.at(-1)).toBe('-')
      expect(request.stdin).toContain('secret prompt')
      expect(request.args.join(' ')).not.toContain('secret prompt')
      return { exitCode: 0, lastMessage: JSON.stringify({ assistantText: 'A concise answer.' }) }
    }
    const client = new CodexCliChatClient({
      executable: 'codex',
      model: 'explicit-test-model',
      workingDirectory: '/tmp/cpe-empty-run',
      outputSchemaPath: '/tmp/cpe-schema.json',
      outputPath: '/tmp/cpe-output.json',
      execute,
    })
    await expect(client.complete({ messages: [{ role: 'user', text: 'secret prompt' }] })).resolves.toEqual({
      assistantText: 'A concise answer.',
    })
  })

  it('fails closed for invalid structured output and non-zero process exit', async () => {
    const invalid = new CodexCliChatClient({
      executable: 'codex',
      model: 'explicit-test-model',
      workingDirectory: '/tmp/cpe-empty-run',
      outputSchemaPath: '/tmp/cpe-schema.json',
      outputPath: '/tmp/cpe-output.json',
      execute: async () => ({ exitCode: 0, lastMessage: '{"wrong":"field"}' }),
    })
    await expect(invalid.complete({ messages: [] })).rejects.toThrow(/assistantText|structured/i)

    const failed = new CodexCliChatClient({
      executable: 'codex',
      model: 'explicit-test-model',
      workingDirectory: '/tmp/cpe-empty-run',
      outputSchemaPath: '/tmp/cpe-schema.json',
      outputPath: '/tmp/cpe-output.json',
      execute: async () => ({ exitCode: 17, lastMessage: 'provider secret must not leak' }),
    })
    await expect(failed.complete({ messages: [] })).rejects.toThrow('status 17')
  })
})
