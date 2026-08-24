import type { ExperienceSnapshot } from './types.js'

/** Presentation only: no mutations, resolution, or preference inference. */
export function renderExperienceSnapshot(_snapshot: ExperienceSnapshot): string {
  const snapshot = _snapshot
  const pending = snapshot.pending.length === 0
    ? '（无）'
    : snapshot.pending.map((candidate) => [
      `- ${candidate.id}`,
      `  Preference: ${candidate.preference.key} = ${candidate.preference.value}`,
      `  Scope: ${candidate.scope.kind}/${candidate.scope.kind === 'domain' ? candidate.scope.domain : 'n/a'}`,
      `  Evidence IDs: ${candidate.evidenceIds.join(', ') || '（无）'}`,
      `  Confidence (informational): ${candidate.confidence.toFixed(2)}`,
      '  Confirmation required',
    ].join('\n')).join('\n')
  const active = snapshot.activePreferences.length === 0
    ? '（无）'
    : snapshot.activePreferences.map((record) => `- ${record.id}: ${record.preference.key} = ${record.preference.value}`).join('\n')
  const excluded = snapshot.resolution.excluded.length === 0
    ? '（无）'
    : snapshot.resolution.excluded.map((item) => `- ${item.recordId}: ${item.reason}`).join('\n')
  const guidance = Object.keys(snapshot.guidance).length === 0 ? '（空）' : JSON.stringify(snapshot.guidance)
  return [
    `Current domain: ${snapshot.domain}`,
    `Pending:\n${pending}`,
    `Active Profile:\n${active}`,
    `Excluded:\n${excluded}`,
    `Guidance: ${guidance}`,
    `${snapshot.preview.label}: ${snapshot.preview.mode} — ${snapshot.preview.text}`,
  ].join('\n') + '\n'
}
