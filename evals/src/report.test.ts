import { describe, expect, it } from 'vitest'

import { createBlindedBehaviorExport, createM1Report, renderM1ReportMarkdown } from './report.js'

const quality = {
  caseCount: 75,
  truePositiveCount: 60,
  falsePositiveCount: 5,
  falseNegativeCount: 5,
  precision: 0.923,
  recall: 0.923,
  abstentionAccuracy: 0.9,
  conflictChangeAccuracy: 0.9,
  crossDomainLeakageCount: 0,
  candidatesPer20Turns: 16,
} as const

const gate = {
  passed: true,
  backgroundCandidatesPer20Turns: 1,
  failures: [],
} as const

describe('M1 aggregate report', () => {
  it('records reproducibility metadata and aggregate-only metrics', () => {
    const report = createM1Report({
      metadata: {
        evaluationMode: 'full',
        modelId: 'gpt-5.6-terra',
        provider: 'codex-cli',
        cliVersion: '0.148.0',
        promptVersion: 'm1-reference-host-v1',
        outputSchemaVersion: 'chat-response-v1',
        datasetManifestSha256: 'a'.repeat(64),
        baselineVersions: { 'full-history': 'v1', 'plain-memory': 'v1' },
        generationTokenLimit: 512,
        startedAt: '2026-08-25T01:00:00Z',
        endedAt: '2026-08-25T01:10:00Z',
      },
      quality,
      backgroundCandidateCount: 5,
      backgroundTurnCount: 100,
      executionFailureCount: 0,
      gate,
    })
    expect(report.background).toEqual({ candidateCount: 5, turnCount: 100, candidatesPer20Turns: 1 })
    expect(report.status).toBe('M1_GATE')
    expect(JSON.stringify(report)).not.toContain('Synthetic text')
    expect(renderM1ReportMarkdown(report)).toContain('Status: PASS')
    expect(renderM1ReportMarkdown(report)).toContain('gpt-5.6-terra')
  })

  it('exports deterministic blinded rows with a separate concealed mapping', () => {
    const pairs = [
      { scenarioId: 'scenario-1', responseA: 'A1', responseB: 'B1', systemA: 'engine-a', systemB: 'engine-b' },
      { scenarioId: 'scenario-2', responseA: 'A2', responseB: 'B2', systemA: 'engine-a', systemB: 'engine-b' },
    ]
    const first = createBlindedBehaviorExport(pairs, 42)
    const second = createBlindedBehaviorExport(pairs, 42)
    expect(first).toEqual(second)
    expect(first.rows[0]).toMatchObject({ scenarioId: 'scenario-1' })
    expect(first.rows[0]).not.toHaveProperty('systemA')
    expect(first.concealedMapping['scenario-1']).toEqual(expect.objectContaining({ A: expect.any(String), B: expect.any(String) }))
  })
})
