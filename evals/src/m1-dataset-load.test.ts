import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { loadBackgroundTurns, loadDatasetManifest, loadDevelopmentDataset, verifyDatasetManifest } from './load.js'
import { validateM1DatasetComposition } from './m1-dataset-contract.js'

const datasets = fileURLToPath(new URL('../datasets/', import.meta.url))
const manifest = `${datasets}/manifest-v2.json`

describe('M1 frozen dataset files', () => {
  it('loads the 75-case quality set and 100-turn background set', async () => {
    const work = await loadDevelopmentDataset(`${datasets}/work-v1.jsonl`)
    const cross = await loadDevelopmentDataset(`${datasets}/cross-domain-v1.jsonl`)
    const background = await loadBackgroundTurns(`${datasets}/confirmation-burden-v1.jsonl`)
    expect(validateM1DatasetComposition({ qualityCases: [...work, ...cross], backgroundTurns: background })).toMatchObject({
      qualityCaseCount: 75,
      backgroundTurnCount: 100,
    })
  })

  it('verifies manifest v2 hashes, counts, and category minima', async () => {
    await expect(loadDatasetManifest(manifest)).resolves.toMatchObject({ schemaVersion: 2, backgroundMinimumTurns: 100 })
    await expect(verifyDatasetManifest(manifest)).resolves.toBeUndefined()
  })
})
