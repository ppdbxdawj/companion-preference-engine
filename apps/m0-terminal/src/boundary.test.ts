import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const sourceDirectory = dirname(fileURLToPath(import.meta.url))
const packageDirectory = dirname(sourceDirectory)
const forbiddenSourceTokens = [
  'fetch(', 'globalThis.fetch', 'WebSocket', 'node:net', 'node:http', 'node:https',
  'node:fs', 'node:child_process', 'node:sqlite', 'better-sqlite', 'process.env',
  '@companion-preference/runtime', '@proj-airi', 'airi', 'mcp', 'sqlite', 'child_process',
  'spawn(', 'exec(', 'execFile(', 'fork(',
]

describe('M0.5 terminal boundary', () => {
  it('uses only the three frozen governed packages and no service-capable imports', async () => {
    const manifest = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(Object.keys(manifest.dependencies).sort()).toEqual([
      '@companion-preference/contracts',
      '@companion-preference/observer',
      '@companion-preference/preference-core',
    ])

    const sourceFiles = (await readdir(sourceDirectory)).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    const sources = await Promise.all(sourceFiles.map((name) => readFile(join(sourceDirectory, name), 'utf8')))
    for (const token of forbiddenSourceTokens) {
      expect(sources.join('\n')).not.toContain(token)
    }
  })
})
