import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  loadDatasetManifest,
  loadDevelopmentDataset,
  loadHeldOutInputs,
  verifyDatasetManifest,
} from './load.js'

const datasets = fileURLToPath(new URL('../datasets/', import.meta.url))
const manifestPath = fileURLToPath(
  new URL('../datasets/manifest-v1.json', import.meta.url),
)

describe('frozen evaluation data loader', () => {
  it('loads 30 reviewed development cases with exact category counts', async () => {
    const work = await loadDevelopmentDataset(`${datasets}/work-core-v1.jsonl`)
    const crossDomain = await loadDevelopmentDataset(
      `${datasets}/cross-domain-core-v1.jsonl`,
    )
    const all = [...work, ...crossDomain]

    expect(all).toHaveLength(30)
    expect(new Set(all.map((item) => item.id)).size).toBe(30)
    expect(
      Object.fromEntries(
        [...new Set(all.map((item) => item.category))].map((category) => [
          category,
          all.filter((item) => item.category === category).length,
        ]),
      ),
    ).toEqual({
      'work-explicit-or-repeated': 6,
      'temporary-state': 4,
      'conflict-or-change': 4,
      'ambiguous-abstention': 4,
      'cross-domain-counterfactual': 12,
    })

    const pairs = new Map<string, number>()
    for (const item of crossDomain) {
      const pairId = item.counterfactualPairId!
      pairs.set(pairId, (pairs.get(pairId) ?? 0) + 1)
    }
    expect(pairs.size).toBe(6)
    expect([...pairs.values()]).toEqual([2, 2, 2, 2, 2, 2])
  })

  it('loads held-out inputs without shared labels', async () => {
    const heldOutPath = `${datasets}/held-out-input-core-v1.jsonl`
    const raw = await readFile(heldOutPath, 'utf8')
    const heldOut = await loadHeldOutInputs(heldOutPath)

    expect(heldOut).toHaveLength(12)
    expect(raw).not.toContain('expectedCandidates')
    expect(raw).not.toContain('expectedGuidance')
    expect(raw).not.toContain('forbiddenKeys')
  })

  it('verifies exact-byte SHA-256 commitments and counts', async () => {
    const manifest = await loadDatasetManifest(manifestPath)
    expect(manifest.datasets).toHaveLength(3)
    expect(manifest.externalHeldOutLabels.storage).toBe('external-high-tier-only')
    await expect(verifyDatasetManifest(manifestPath)).resolves.toBeUndefined()

    for (const entry of manifest.datasets) {
      const bytes = await readFile(
        fileURLToPath(new URL(`../datasets/${entry.path}`, import.meta.url)),
      )
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256)
    }
  })

  it('rejects blank lines, malformed JSON, unknown fields, and duplicate IDs', async () => {
    const valid = {
      schemaVersion: 1,
      id: 'valid-case',
      category: 'ambiguous-abstention',
      turns: [{ sourceRef: 'turn-1', role: 'user', text: 'Could this be a preference?' }],
      expectedCandidates: [],
      forbiddenKeys: [],
      queryContext: {
        userId: 'synthetic-user',
        companionId: 'synthetic-companion',
        relationshipId: 'synthetic-relationship',
        hostId: 'reference-host',
        domain: 'work',
        now: '2026-08-24T00:00:00Z',
      },
      expectedGuidance: {},
    } as const
    const invalidCases = [
      `${JSON.stringify(valid)}\n\n`,
      '{not-json}\n',
      `${JSON.stringify({ ...valid, extra: true })}\n`,
      `${JSON.stringify(valid)}\n${JSON.stringify(valid)}\n`,
    ]

    for (const content of invalidCases) {
      await expect(
        loadDevelopmentDataset(`data:application/jsonl,${encodeURIComponent(content)}`),
      ).rejects.toThrow()
    }
  })
})
