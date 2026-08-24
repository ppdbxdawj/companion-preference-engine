import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'

import type {
  DatasetManifest,
  DevelopmentEvaluationCase,
  HeldOutEvaluationInput,
} from './schema.js'

const stableId = /^[a-z0-9][a-z0-9-]+$/
const sha256 = /^[0-9a-f]{64}$/
const categories = new Set([
  'work-explicit-or-repeated',
  'temporary-state',
  'conflict-or-change',
  'ambiguous-abstention',
  'cross-domain-counterfactual',
])
const preferenceValues: Record<string, readonly string[]> = {
  'interaction.response_detail': ['concise', 'balanced', 'detailed'],
  'interaction.directness': ['gentle', 'balanced', 'direct'],
  'interaction.initiative': ['ask_first', 'low_risk_auto', 'proactive'],
  'interaction.interruption_policy': ['never_interrupt', 'important_only', 'allowed'],
  'work.approval_style': ['always_ask', 'risk_based', 'review_after'],
  'work.verification_depth': ['minimal', 'targeted', 'exhaustive'],
  'companion.support_style': ['listen_first', 'acknowledge_then_act', 'direct_action'],
}
const guidanceValues: Record<string, readonly string[]> = {
  responseDetail: preferenceValues['interaction.response_detail']!,
  directness: preferenceValues['interaction.directness']!,
  initiative: preferenceValues['interaction.initiative']!,
  interruptionPolicy: preferenceValues['interaction.interruption_policy']!,
  approvalStyle: preferenceValues['work.approval_style']!,
  verificationDepth: preferenceValues['work.verification_depth']!,
  supportStyle: preferenceValues['companion.support_style']!,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional])
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`missing field: ${key}`)
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`unknown field: ${key}`)
  }
}

function nonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`invalid ${field}`)
  }
}

function stableIdentifier(value: unknown, field: string): asserts value is string {
  nonEmptyString(value, field)
  if (!stableId.test(value)) throw new Error(`invalid ${field}`)
}

function oneOf<T extends string>(value: unknown, values: readonly T[], field: string): asserts value is T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new Error(`invalid ${field}`)
  }
}

function stringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`invalid ${field}`)
  }
}

function validatePreference(value: unknown): void {
  if (!isRecord(value)) throw new Error('invalid preference')
  exactKeys(value, ['key', 'value'])
  oneOf(value.key, Object.keys(preferenceValues), 'preference.key')
  oneOf(value.value, preferenceValues[value.key]!, 'preference.value')
}

function validateScope(value: unknown): void {
  if (!isRecord(value)) throw new Error('invalid scope')
  nonEmptyString(value.kind, 'scope.kind')
  switch (value.kind) {
    case 'task':
      exactKeys(value, ['kind', 'taskId'])
      nonEmptyString(value.taskId, 'scope.taskId')
      return
    case 'workspace':
      exactKeys(value, ['kind', 'workspaceId'])
      nonEmptyString(value.workspaceId, 'scope.workspaceId')
      return
    case 'host':
      exactKeys(value, ['kind', 'hostId'])
      nonEmptyString(value.hostId, 'scope.hostId')
      return
    case 'domain':
      exactKeys(value, ['kind', 'domain'])
      oneOf(value.domain, ['work', 'companion'], 'scope.domain')
      return
    case 'global':
      exactKeys(value, ['kind'])
      return
    default:
      throw new Error('invalid scope.kind')
  }
}

function validateTurn(value: unknown): void {
  if (!isRecord(value)) throw new Error('invalid turn')
  exactKeys(value, ['sourceRef', 'role', 'text'])
  nonEmptyString(value.sourceRef, 'turn.sourceRef')
  oneOf(value.role, ['user', 'assistant'], 'turn.role')
  nonEmptyString(value.text, 'turn.text')
}

function validateQueryContext(value: unknown): void {
  if (!isRecord(value)) throw new Error('invalid queryContext')
  exactKeys(value, ['userId', 'companionId', 'relationshipId', 'hostId', 'domain', 'now'], [
    'workspaceId',
    'taskId',
  ])
  for (const field of ['userId', 'companionId', 'relationshipId', 'hostId', 'now']) {
    nonEmptyString(value[field], `queryContext.${field}`)
  }
  oneOf(value.domain, ['work', 'companion'], 'queryContext.domain')
  for (const field of ['workspaceId', 'taskId']) {
    if (Object.hasOwn(value, field)) nonEmptyString(value[field], `queryContext.${field}`)
  }
}

function validateGuidance(value: unknown): void {
  if (!isRecord(value)) throw new Error('invalid expectedGuidance')
  const fields = Object.keys(guidanceValues)
  for (const key of Object.keys(value)) {
    if (key === 'avoid') {
      if (!Array.isArray(value[key]) || value[key].some((item) => item !== 'generic_reassurance')) {
        throw new Error('invalid expectedGuidance.avoid')
      }
    } else {
      oneOf(key, fields, 'expectedGuidance field')
      oneOf(value[key], guidanceValues[key]!, `expectedGuidance.${key}`)
    }
  }
}

function validateExpectedCandidate(value: unknown, sourceRefs: ReadonlySet<string>): void {
  if (!isRecord(value)) throw new Error('invalid expected candidate')
  exactKeys(value, [
    'preference',
    'scope',
    'evidenceSourceRefs',
    'counterEvidenceSourceRefs',
  ])
  validatePreference(value.preference)
  validateScope(value.scope)
  for (const field of ['evidenceSourceRefs', 'counterEvidenceSourceRefs']) {
    stringArray(value[field], `candidate.${field}`)
    for (const sourceRef of value[field]) {
      if (!sourceRefs.has(sourceRef)) throw new Error(`unknown candidate evidence ref: ${sourceRef}`)
    }
  }
}

function validateDevelopmentCase(value: unknown): asserts value is DevelopmentEvaluationCase {
  if (!isRecord(value)) throw new Error('evaluation case must be an object')
  exactKeys(value, [
    'schemaVersion',
    'id',
    'category',
    'turns',
    'expectedCandidates',
    'forbiddenKeys',
    'queryContext',
    'expectedGuidance',
  ], ['counterfactualPairId'])
  if (value.schemaVersion !== 1) throw new Error('unsupported schemaVersion')
  stableIdentifier(value.id, 'id')
  oneOf(value.category, [...categories], 'category')
  if (Object.hasOwn(value, 'counterfactualPairId')) {
    stableIdentifier(value.counterfactualPairId, 'counterfactualPairId')
  }
  if (value.category === 'cross-domain-counterfactual' && !Object.hasOwn(value, 'counterfactualPairId')) {
    throw new Error('cross-domain case requires counterfactualPairId')
  }
  if (value.category !== 'cross-domain-counterfactual' && Object.hasOwn(value, 'counterfactualPairId')) {
    throw new Error('counterfactualPairId is only valid for cross-domain cases')
  }
  if (!Array.isArray(value.turns) || value.turns.length === 0) throw new Error('invalid turns')
  for (const turn of value.turns) validateTurn(turn)
  const sourceRefs = new Set<string>(
    (value.turns as Array<Record<string, unknown>>).map((turn) => turn.sourceRef as string),
  )
  if (sourceRefs.size !== value.turns.length) throw new Error('duplicate turn sourceRef')
  if (!Array.isArray(value.expectedCandidates)) throw new Error('invalid expectedCandidates')
  for (const candidate of value.expectedCandidates) validateExpectedCandidate(candidate, sourceRefs)
  stringArray(value.forbiddenKeys, 'forbiddenKeys')
  for (const key of value.forbiddenKeys) oneOf(key, Object.keys(preferenceValues), 'forbiddenKeys')
  if (new Set(value.forbiddenKeys).size !== value.forbiddenKeys.length) throw new Error('duplicate forbidden key')
  validateQueryContext(value.queryContext)
  validateGuidance(value.expectedGuidance)
}

function validateHeldOutInput(value: unknown): asserts value is HeldOutEvaluationInput {
  if (!isRecord(value)) throw new Error('held-out input must be an object')
  exactKeys(value, ['schemaVersion', 'id', 'category', 'turns', 'queryContext'], ['counterfactualPairId'])
  if (value.schemaVersion !== 1) throw new Error('unsupported schemaVersion')
  stableIdentifier(value.id, 'id')
  oneOf(value.category, [...categories], 'category')
  if (Object.hasOwn(value, 'counterfactualPairId')) stableIdentifier(value.counterfactualPairId, 'counterfactualPairId')
  if (value.category === 'cross-domain-counterfactual' && !Object.hasOwn(value, 'counterfactualPairId')) {
    throw new Error('cross-domain case requires counterfactualPairId')
  }
  if (value.category !== 'cross-domain-counterfactual' && Object.hasOwn(value, 'counterfactualPairId')) {
    throw new Error('counterfactualPairId is only valid for cross-domain cases')
  }
  if (!Array.isArray(value.turns) || value.turns.length === 0) throw new Error('invalid turns')
  for (const turn of value.turns) validateTurn(turn)
  const sourceRefs = new Set(value.turns.map((turn) => (turn as Record<string, unknown>).sourceRef))
  if (sourceRefs.size !== value.turns.length) throw new Error('duplicate turn sourceRef')
  validateQueryContext(value.queryContext)
}

async function readBytes(source: string): Promise<Buffer> {
  if (!source.startsWith('data:')) return readFile(source)
  const comma = source.indexOf(',')
  if (comma < 0) throw new Error('invalid data URL')
  const metadata = source.slice(5, comma).toLowerCase()
  const payload = source.slice(comma + 1)
  if (metadata.endsWith(';base64')) return Buffer.from(payload, 'base64')
  try {
    return Buffer.from(decodeURIComponent(payload), 'utf8')
  } catch {
    throw new Error('invalid data URL encoding')
  }
}

async function readJsonl<T>(source: string, validate: (value: unknown) => asserts value is T): Promise<T[]> {
  const bytes = await readBytes(source)
  const content = bytes.toString('utf8')
  const lines = content.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  if (lines.length === 0) throw new Error('JSONL dataset is empty')
  const result: T[] = []
  const ids = new Set<string>()
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') throw new Error(`blank JSONL line ${index + 1}`)
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      throw new Error(`malformed JSON on line ${index + 1}`)
    }
    validate(parsed)
    const id = (parsed as { id: string }).id
    if (ids.has(id)) throw new Error(`duplicate case ID: ${id}`)
    ids.add(id)
    result.push(parsed)
  }
  return result
}

export async function loadDevelopmentDataset(
  path: string,
): Promise<DevelopmentEvaluationCase[]> {
  return readJsonl(path, validateDevelopmentCase)
}

export async function loadHeldOutInputs(
  path: string,
): Promise<HeldOutEvaluationInput[]> {
  return readJsonl(path, validateHeldOutInput)
}

export async function loadDatasetManifest(
  path: string,
): Promise<DatasetManifest> {
  const bytes = await readBytes(path)
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new Error('malformed dataset manifest JSON')
  }
  if (!isRecord(parsed)) throw new Error('manifest must be an object')
  exactKeys(parsed, ['schemaVersion', 'frozenAt', 'datasets', 'externalHeldOutLabels', 'labelChangePolicy'])
  if (parsed.schemaVersion !== 1) throw new Error('unsupported manifest schemaVersion')
  nonEmptyString(parsed.frozenAt, 'manifest.frozenAt')
  if (Number.isNaN(Date.parse(parsed.frozenAt))) throw new Error('invalid manifest.frozenAt')
  if (!Array.isArray(parsed.datasets) || parsed.datasets.length === 0) throw new Error('invalid manifest.datasets')
  const paths = new Set<string>()
  for (const entry of parsed.datasets) {
    if (!isRecord(entry)) throw new Error('invalid manifest dataset entry')
    exactKeys(entry, ['path', 'kind', 'caseCount', 'sha256'])
    nonEmptyString(entry.path, 'manifest dataset path')
    if (isAbsolute(entry.path) || entry.path.startsWith('data:')) throw new Error('manifest dataset path must be relative')
    oneOf(entry.kind, ['development', 'held-out-input'], 'manifest dataset kind')
    if (typeof entry.caseCount !== 'number' || !Number.isSafeInteger(entry.caseCount) || entry.caseCount < 0) {
      throw new Error('invalid manifest caseCount')
    }
    if (typeof entry.sha256 !== 'string' || !sha256.test(entry.sha256)) throw new Error('invalid manifest sha256')
    if (paths.has(entry.path)) throw new Error(`duplicate manifest path: ${entry.path}`)
    paths.add(entry.path)
  }
  if (!isRecord(parsed.externalHeldOutLabels)) throw new Error('invalid externalHeldOutLabels')
  exactKeys(parsed.externalHeldOutLabels, ['caseCount', 'sha256', 'storage'])
  if (typeof parsed.externalHeldOutLabels.caseCount !== 'number'
    || !Number.isSafeInteger(parsed.externalHeldOutLabels.caseCount)
    || parsed.externalHeldOutLabels.caseCount < 0) {
    throw new Error('invalid external held-out caseCount')
  }
  if (typeof parsed.externalHeldOutLabels.sha256 !== 'string' || !sha256.test(parsed.externalHeldOutLabels.sha256)) {
    throw new Error('invalid external held-out sha256')
  }
  if (parsed.externalHeldOutLabels.storage !== 'external-high-tier-only') throw new Error('invalid external label storage')
  if (parsed.labelChangePolicy !== 'new-manifest-version-and-reviewed-gold-correction') {
    throw new Error('invalid labelChangePolicy')
  }
  return parsed as DatasetManifest
}

export async function verifyDatasetManifest(
  manifestPath: string,
): Promise<void> {
  if (manifestPath.startsWith('data:')) throw new Error('manifest verification requires a filesystem path')
  const manifest = await loadDatasetManifest(manifestPath)
  for (const entry of manifest.datasets) {
    const datasetPath = resolve(dirname(manifestPath), entry.path)
    const bytes = await readBytes(datasetPath)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest !== entry.sha256) throw new Error(`SHA-256 mismatch for ${entry.path}`)
    const loaded = entry.kind === 'development'
      ? await loadDevelopmentDataset(datasetPath)
      : await loadHeldOutInputs(datasetPath)
    if (loaded.length !== entry.caseCount) {
      throw new Error(`case count mismatch for ${entry.path}`)
    }
  }
}
