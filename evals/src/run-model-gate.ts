import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

import type { BehaviorGuidance, Preference, PreferenceScope } from '@companion-preference/contracts'

import { classifyQualityCaseOutcome, scoreCandidateEvaluation, type CandidateEvaluationPrediction } from './candidate-eval.js'
import { scoreBackgroundBurden } from './behavior-eval.js'
import { loadBackgroundTurns, loadDatasetManifest, loadDevelopmentDataset, verifyDatasetManifest } from './load.js'
import { validateM1DatasetComposition } from './m1-dataset-contract.js'
import { decideM1Gate } from './m1-gate.js'
import { createM1Report, renderM1ReportMarkdown, type EvaluationItemOutcome } from './report.js'
import type { BackgroundEvaluationTurn, DevelopmentEvaluationCase } from './schema.js'

const execFileAsync = promisify(execFile)
const preferenceKeys: Record<string, readonly string[]> = {
  'interaction.response_detail': ['concise', 'balanced', 'detailed'],
  'interaction.directness': ['gentle', 'balanced', 'direct'],
  'interaction.initiative': ['ask_first', 'low_risk_auto', 'proactive'],
  'interaction.interruption_policy': ['never_interrupt', 'important_only', 'allowed'],
  'work.approval_style': ['always_ask', 'risk_based', 'review_after'],
  'work.verification_depth': ['minimal', 'targeted', 'exhaustive'],
  'companion.support_style': ['listen_first', 'acknowledge_then_act', 'direct_action'],
}
const guidanceKeys = new Set(['responseDetail', 'directness', 'initiative', 'interruptionPolicy', 'approvalStyle', 'verificationDepth', 'supportStyle', 'avoid'])
const guidancePreferenceKeys: Record<string, keyof typeof preferenceKeys> = {
  responseDetail: 'interaction.response_detail',
  directness: 'interaction.directness',
  initiative: 'interaction.initiative',
  interruptionPolicy: 'interaction.interruption_policy',
  approvalStyle: 'work.approval_style',
  verificationDepth: 'work.verification_depth',
  supportStyle: 'companion.support_style',
}
const QUALITY_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    caseId: { type: 'string' },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          preference: {
            type: 'object',
            additionalProperties: false,
            properties: { key: { type: 'string' }, value: { type: 'string' } },
            required: ['key', 'value'],
          },
          scope: {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', const: 'domain' },
              domain: { type: 'string', enum: ['work', 'companion'] },
            },
            required: ['kind', 'domain'],
          },
        },
        required: ['preference', 'scope'],
      },
    },
    guidance: {
      type: 'object',
      additionalProperties: false,
      properties: {
        responseDetail: { type: ['string', 'null'] },
        directness: { type: ['string', 'null'] },
        initiative: { type: ['string', 'null'] },
        interruptionPolicy: { type: ['string', 'null'] },
        approvalStyle: { type: ['string', 'null'] },
        verificationDepth: { type: ['string', 'null'] },
        supportStyle: { type: ['string', 'null'] },
        avoid: { type: ['array', 'null'], items: { type: 'string', const: 'generic_reassurance' } },
      },
      required: ['responseDetail', 'directness', 'initiative', 'interruptionPolicy', 'approvalStyle', 'verificationDepth', 'supportStyle', 'avoid'],
    },
  },
  required: ['caseId', 'candidates', 'guidance'],
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePreference(value: unknown): Preference {
  if (!isRecord(value) || typeof value.key !== 'string' || !Object.hasOwn(preferenceKeys, value.key)
    || typeof value.value !== 'string' || !preferenceKeys[value.key]!.includes(value.value)) {
    throw new Error('model returned invalid preference')
  }
  return value as Preference
}

function parseScope(value: unknown): PreferenceScope {
  if (!isRecord(value) || value.kind !== 'domain' || (value.domain !== 'work' && value.domain !== 'companion')) {
    throw new Error('model returned invalid preference scope')
  }
  return value as PreferenceScope
}

function parseGuidance(value: unknown): BehaviorGuidance {
  if (!isRecord(value) || Object.keys(value).some((key) => !guidanceKeys.has(key))) {
    throw new Error('model returned invalid guidance')
  }
  const guidance: BehaviorGuidance = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === null) continue
    if (key === 'avoid') {
      if (!Array.isArray(item) || item.some((entry) => entry !== 'generic_reassurance')) {
        throw new Error('model returned invalid guidance')
      }
      guidance.avoid = item as Array<'generic_reassurance'>
      continue
    }
    const preferenceKey = guidancePreferenceKeys[key]
    if (!preferenceKey || typeof item !== 'string' || !preferenceKeys[preferenceKey]!.includes(item)) {
      throw new Error('model returned invalid guidance')
    }
    switch (key) {
      case 'responseDetail': guidance.responseDetail = item as 'concise' | 'balanced' | 'detailed'; break
      case 'directness': guidance.directness = item as 'gentle' | 'balanced' | 'direct'; break
      case 'initiative': guidance.initiative = item as 'ask_first' | 'low_risk_auto' | 'proactive'; break
      case 'interruptionPolicy': guidance.interruptionPolicy = item as 'never_interrupt' | 'important_only' | 'allowed'; break
      case 'approvalStyle': guidance.approvalStyle = item as 'always_ask' | 'risk_based' | 'review_after'; break
      case 'verificationDepth': guidance.verificationDepth = item as 'minimal' | 'targeted' | 'exhaustive'; break
      case 'supportStyle': guidance.supportStyle = item as 'listen_first' | 'acknowledge_then_act' | 'direct_action'; break
    }
  }
  return guidance
}

function parseQualityOutput(value: unknown): CandidateEvaluationPrediction {
  if (!isRecord(value) || typeof value.caseId !== 'string' || !Array.isArray(value.candidates)) {
    throw new Error('model returned invalid quality output')
  }
  const candidates = value.candidates.map((candidate) => {
    if (!isRecord(candidate)) throw new Error('model returned invalid candidate')
    return { preference: parsePreference(candidate.preference), scope: parseScope(candidate.scope) }
  })
  return { caseId: value.caseId, candidates, guidance: parseGuidance(value.guidance) }
}

function parseBackgroundOutput(value: unknown): number {
  if (!isRecord(value) || typeof value.candidateCount !== 'number'
    || !Number.isSafeInteger(value.candidateCount) || value.candidateCount < 0) {
    throw new Error('model returned invalid background output')
  }
  return value.candidateCount
}

export type CodexEvaluationRunnerOptions = Readonly<{
  executable: string
  model: string
  timeoutMs?: number
  maxOutputBytes?: number
}>

type CodexOutput = Readonly<{
  exitCode: number
  lastMessage: string
}>

function runProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
  stdin: string,
  timeoutMs: number,
): Promise<CodexOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      shell: false,
      stdio: ['pipe', 'ignore', 'pipe'],
    })
    let stderrBytes = 0
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.byteLength
    })
    let settled = false
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      if (!settled) {
        settled = true
        reject(new Error('Codex CLI evaluation timed out'))
      }
    }, timeoutMs)
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`Codex CLI process failed: ${error.message}`))
    })
    child.once('close', async (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`Codex CLI exited with status ${code ?? 'unknown'} (${stderrBytes} diagnostic bytes)`))
        return
      }
      resolve({ exitCode: code ?? 0, lastMessage: '' })
    })
    child.stdin.end(stdin)
  })
}

async function runCodexJson(
  options: CodexEvaluationRunnerOptions,
  prompt: string,
  schema: unknown,
): Promise<unknown> {
  const directory = await mkdtemp(join(tmpdir(), 'cpe-m1-'))
  const schemaPath = join(directory, 'output-schema.json')
  const outputPath = join(directory, 'last-message.json')
  const timeoutMs = options.timeoutMs ?? 120_000
  const maxOutputBytes = options.maxOutputBytes ?? 1_000_000
  await writeFile(schemaPath, JSON.stringify(schema), 'utf8')
  const args = [
    'exec', '--ephemeral', '--ignore-user-config', '--ignore-rules',
    '--sandbox', 'read-only',
    '--skip-git-repo-check', '--model', options.model,
    '--output-schema', schemaPath, '--output-last-message', outputPath, '-',
  ]
  try {
    await runProcess(options.executable, args, directory, prompt, timeoutMs)
    const bytes = await readFile(outputPath)
    if (bytes.byteLength > maxOutputBytes) throw new Error('Codex CLI output exceeded the configured limit')
    return JSON.parse(bytes.toString('utf8')) as unknown
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function qualityPrompt(item: DevelopmentEvaluationCase): string {
  return [
    'Return one JSON object matching the output schema.',
    'Infer only from this synthetic consented evaluation case. Do not invent evidence.',
    'For candidates, use only these exact canonical key/value pairs:',
    '- interaction.response_detail: concise | balanced | detailed',
    '- interaction.directness: gentle | balanced | direct',
    '- interaction.initiative: ask_first | low_risk_auto | proactive',
    '- interaction.interruption_policy: never_interrupt | important_only | allowed',
    '- work.approval_style: always_ask | risk_based | review_after',
    '- work.verification_depth: minimal | targeted | exhaustive',
    '- companion.support_style: listen_first | acknowledge_then_act | direct_action',
    'Do not shorten, rename, or translate canonical keys. Use an empty candidates array when abstaining.',
    JSON.stringify({ caseId: item.id, turns: item.turns, queryContext: item.queryContext }),
  ].join('\n')
}

function backgroundPrompt(turn: BackgroundEvaluationTurn): string {
  return [
    'Return one JSON object matching the output schema.',
    'This is an ordinary synthetic background turn. Count only a newly proposed preference candidate.',
    JSON.stringify(turn),
  ].join('\n')
}

export class CodexEvaluationRunner {
  constructor(private readonly options: CodexEvaluationRunnerOptions) {}

  async runQuality(item: DevelopmentEvaluationCase): Promise<CandidateEvaluationPrediction> {
    const parsed = parseQualityOutput(await runCodexJson(this.options, qualityPrompt(item), QUALITY_OUTPUT_JSON_SCHEMA))
    if (parsed.caseId !== item.id) throw new Error(`model returned wrong case ID for ${item.id}`)
    return parsed as CandidateEvaluationPrediction
  }

  async runBackground(turn: BackgroundEvaluationTurn): Promise<number> {
    const parsed = parseBackgroundOutput(await runCodexJson(this.options, backgroundPrompt(turn), {
      type: 'object', additionalProperties: false,
      properties: { candidateCount: { type: 'integer', minimum: 0 } },
      required: ['candidateCount'],
    }))
    return parsed
  }
}

export function createQualityOutcome(
  evaluationCase: DevelopmentEvaluationCase,
  prediction: CandidateEvaluationPrediction | undefined,
  executionError = false,
): EvaluationItemOutcome {
  if (executionError) return { itemId: evaluationCase.id, kind: 'quality', status: 'execution-error' }
  if (!prediction) throw new Error(`missing prediction for ${evaluationCase.id}`)
  const outcome = classifyQualityCaseOutcome(evaluationCase, prediction)
  return { itemId: outcome.caseId, kind: outcome.kind, status: outcome.status }
}

export function createBackgroundOutcome(
  itemId: string,
  candidateCount: number,
  executionError = false,
): EvaluationItemOutcome {
  return {
    itemId,
    kind: 'background',
    status: executionError ? 'execution-error' : candidateCount === 0 ? 'clear' : 'candidate-emitted',
  }
}

export type ModelGateOptions = Readonly<{
  evaluationMode?: 'full' | 'smoke'
  model: string
  executable?: string
  manifestPath: string
  outputJsonPath: string
  outputMarkdownPath: string
  allowConfiguredRemote: boolean
  cliVersion?: string
}>

export async function runModelGate(options: ModelGateOptions): Promise<ReturnType<typeof createM1Report>> {
  if (options.model.trim() === '') throw new Error('--model is required')
  if (!options.allowConfiguredRemote) {
    throw new Error('explicit --allow-configured-remote acknowledgement is required')
  }
  const startedAt = new Date().toISOString()
  const manifest = await loadDatasetManifest(options.manifestPath)
  await verifyDatasetManifest(options.manifestPath)
  const manifestSha256 = createHash('sha256')
    .update(await readFile(options.manifestPath))
    .digest('hex')
  const qualityPaths = manifest.datasets.filter((entry) => entry.kind === 'development')
  const backgroundEntry = manifest.datasets.find((entry) => entry.kind === 'background-turn')
  if (!backgroundEntry) throw new Error('manifest has no background-turn dataset')
  const datasetDirectory = dirname(options.manifestPath)
  const qualityCases = (await Promise.all(qualityPaths.map((entry) => loadDevelopmentDataset(join(datasetDirectory, entry.path))))).flat()
  const backgroundTurns = await loadBackgroundTurns(join(datasetDirectory, backgroundEntry.path))
  validateM1DatasetComposition({ qualityCases, backgroundTurns })
  const evaluationMode = options.evaluationMode ?? 'full'
  const selectedQualityCases = evaluationMode === 'smoke'
    ? selectSmokeQualityCases(qualityCases)
    : qualityCases
  const selectedBackgroundTurns = evaluationMode === 'smoke'
    ? backgroundTurns.slice(0, 20)
    : backgroundTurns
  const runner = new CodexEvaluationRunner({ executable: options.executable ?? 'codex', model: options.model })
  const predictions: CandidateEvaluationPrediction[] = []
  const outcomes: EvaluationItemOutcome[] = []
  let executionFailureCount = 0
  for (const item of selectedQualityCases) {
    try {
      const prediction = await runner.runQuality(item)
      predictions.push(prediction)
      outcomes.push(createQualityOutcome(item, prediction))
    } catch {
      executionFailureCount += 1
      predictions.push({ caseId: item.id, candidates: [], guidance: {} })
      outcomes.push(createQualityOutcome(item, undefined, true))
    }
  }
  let backgroundCandidateCount = 0
  for (const turn of selectedBackgroundTurns) {
    try {
      const candidateCount = await runner.runBackground(turn)
      backgroundCandidateCount += candidateCount
      outcomes.push(createBackgroundOutcome(turn.sourceRef, candidateCount))
    } catch {
      executionFailureCount += 1
      outcomes.push(createBackgroundOutcome(turn.sourceRef, 0, true))
    }
  }
  const quality = scoreCandidateEvaluation(selectedQualityCases, predictions)
  const background = scoreBackgroundBurden(selectedBackgroundTurns.length, backgroundCandidateCount)
  const gate = decideM1Gate({ ...quality, backgroundCandidateCount, backgroundTurnCount: selectedBackgroundTurns.length, executionFailureCount })
  const cliVersion = options.cliVersion ?? (await execFileAsync(options.executable ?? 'codex', ['--version'])).stdout.trim()
  const report = createM1Report({
    metadata: {
      modelId: options.model,
      evaluationMode,
      provider: 'codex-cli',
      cliVersion,
      promptVersion: 'm1-codex-cli-evaluation-v1',
      outputSchemaVersion: 'm1-candidate-prediction-v1',
      datasetManifestSha256: manifestSha256,
      baselineVersions: { 'no-personalization': 'v1', 'plain-memory': 'v1', 'semantic-memory-rag': 'v1', 'manual-profile': 'v1', 'full-history': 'v1' },
      generationTokenLimit: 512,
      startedAt,
      endedAt: new Date().toISOString(),
    },
      quality,
      backgroundCandidateCount,
      backgroundTurnCount: selectedBackgroundTurns.length,
    executionFailureCount,
    gate,
    outcomes,
  })
  await writeFile(options.outputJsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
  await writeFile(options.outputMarkdownPath, renderM1ReportMarkdown(report), 'utf8')
  return report
}

function selectSmokeQualityCases(cases: readonly DevelopmentEvaluationCase[]): DevelopmentEvaluationCase[] {
  const selected: DevelopmentEvaluationCase[] = []
  for (const category of [
    'work-explicit-or-repeated',
    'temporary-state',
    'conflict-or-change',
    'ambiguous-abstention',
  ] as const) {
    selected.push(...cases.filter((item) => item.category === category).slice(0, 2))
  }
  const pairs = new Set<string>()
  for (const item of cases) {
    if (item.category === 'cross-domain-counterfactual' && item.counterfactualPairId) {
      pairs.add(item.counterfactualPairId)
      if (pairs.size === 2) break
    }
  }
  selected.push(...cases.filter((item) => item.category === 'cross-domain-counterfactual'
    && item.counterfactualPairId !== undefined && pairs.has(item.counterfactualPairId)))
  if (selected.length !== 12) throw new Error(`smoke quality selection expected 12 cases, got ${selected.length}`)
  return selected
}

function parseArgs(argv: readonly string[]): ModelGateOptions {
  const value = (name: string): string | undefined => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const model = value('--model')
  if (!model) throw new Error('--model is required')
  const base: Omit<ModelGateOptions, 'executable'> = {
    model,
    manifestPath: value('--manifest') ?? 'evals/datasets/manifest-v2.json',
    outputJsonPath: value('--output-json') ?? 'evals/reports/m1-model-gate.json',
    outputMarkdownPath: value('--output-markdown') ?? 'evals/reports/m1-model-gate.md',
    allowConfiguredRemote: argv.includes('--allow-configured-remote'),
    evaluationMode: argv.includes('--smoke') ? 'smoke' : 'full',
  }
  const executable = value('--executable')
  return executable === undefined ? base : { ...base, executable }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = await runModelGate(parseArgs(process.argv.slice(2)))
    process.exitCode = report.gate.passed ? 0 : 1
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'model gate failed'}\n`)
    process.exitCode = 1
  }
}
