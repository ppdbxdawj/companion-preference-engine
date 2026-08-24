import { createInterface } from 'node:readline/promises'

import {
  confirmCandidateCommandFixture,
  effectiveProfileQueryFixture,
  interactionEvidenceFixture,
  pendingCandidateProposalFixture,
  preferenceCandidateFixture,
  revokePreferenceCommandFixture,
  type PreferenceCandidate,
  type PreferenceRecord,
} from '@companion-preference/contracts'
import { FakePreferenceObserver, type ObserverInput, type ObserverProposal } from '@companion-preference/observer'
import {
  applyCandidateAction,
  resolveEffectiveProfile,
  revokePreference,
} from '@companion-preference/preference-core'

import { renderDeterministicPreview } from './preview.js'

export type DemoStreams = Readonly<{
  input: NodeJS.ReadableStream
  output: NodeJS.WritableStream
}>

async function ask(
  answers: AsyncIterator<string>,
  output: NodeJS.WritableStream,
  prompt: string,
): Promise<string | undefined> {
  output.write(prompt)
  const answer = await answers.next()
  return answer.done ? undefined : answer.value
}

/** The frozen M0.5 human checkpoint: no model, network, or persistence. */
export async function runGuidedWalkthrough({ input, output }: DemoStreams): Promise<0 | 1> {
  const readline = createInterface({ input, output })
  const answers = readline[Symbol.asyncIterator]()
  try {
    output.write('M0.5 偏好闭环演练\n')
    output.write(`你表达的偏好：${interactionEvidenceFixture.learningPayload.userText}\n`)

    const observer = new FakePreferenceObserver([
      pendingCandidateProposalFixture as unknown as ObserverProposal,
    ])
    const [proposal] = await observer.propose({
      evidenceWindow: [interactionEvidenceFixture as unknown as ObserverInput['evidenceWindow'][number]],
    })
    if (!proposal) throw new Error('No deterministic candidate proposal')
    const candidate = {
      ...preferenceCandidateFixture,
      ...proposal,
    } as unknown as PreferenceCandidate
    output.write(`候选偏好：回答保持简洁（置信度 ${(candidate.confidence * 100).toFixed(0)}%）\n`)
    const baselinePreview = renderDeterministicPreview({})
    output.write(`${baselinePreview.label}: ${baselinePreview.mode} — ${baselinePreview.text}\n`)

    let confirmation: string | undefined
    while (true) {
      confirmation = await ask(answers, output, '[c] 确认  [q] 退出 > ')
      if (confirmation === undefined || ['c', 'q'].includes(confirmation.trim().toLowerCase())) break
      output.write('请输入 c 确认或 q 退出。\n')
    }
    if (confirmation === undefined || confirmation.trim().toLowerCase() === 'q') return 0

    const action = {
      ...confirmCandidateCommandFixture,
      actor: 'user' as const,
      auditEventId: 'audit-candidate-confirm-1',
      type: 'confirm' as const,
    }
    const execution = applyCandidateAction(candidate, action)
    if (execution.result.kind !== 'confirmed') throw new Error('Candidate confirmation failed')
    const activePreference = execution.result.preference as unknown as PreferenceRecord
    const work = resolveEffectiveProfile([activePreference], effectiveProfileQueryFixture)
    if (work.guidance.responseDetail !== 'concise' || work.applied.length !== 1) throw new Error('Work guidance did not apply')
    output.write('工作域 guidance：responseDetail=concise\n')
    const concisePreview = renderDeterministicPreview(work.guidance)
    output.write(`${concisePreview.label}: ${concisePreview.mode} — ${concisePreview.text}\n`)

    const companion = resolveEffectiveProfile(
      [activePreference],
      { ...effectiveProfileQueryFixture, domain: 'companion' },
    )
    if (Object.keys(companion.guidance).length !== 0 || companion.applied.length !== 0 || !companion.excluded.some((item) => item.reason === 'privacy-domain-mismatch')) {
      throw new Error('Companion-domain isolation failed')
    }
    output.write('陪伴域：未生效（privacy-domain-mismatch）\n')

    let revocation: string | undefined
    while (true) {
      revocation = await ask(answers, output, '[u] 撤销  [q] 退出 > ')
      if (revocation === undefined || ['u', 'q'].includes(revocation.trim().toLowerCase())) break
      output.write('请输入 u 撤销或 q 退出。\n')
    }
    if (revocation === undefined || revocation.trim().toLowerCase() === 'q') return 0

    const revokeAction = {
      ...revokePreferenceCommandFixture,
      actor: 'user' as const,
      auditEventId: 'audit-preference-revoke-1',
      type: 'revoke' as const,
    }
    const revokedExecution = revokePreference(activePreference, revokeAction)
    const revokedPreference = revokedExecution.result.preference as unknown as PreferenceRecord
    const afterRevoke = resolveEffectiveProfile([revokedPreference], effectiveProfileQueryFixture)
    if (Object.keys(afterRevoke.guidance).length !== 0 || afterRevoke.applied.length !== 0 || !afterRevoke.excluded.some((item) => item.reason === 'inactive-status')) {
      throw new Error('Revocation did not remove guidance')
    }
    output.write('已撤销；工作域 guidance：空（inactive-status）\n')
    const afterRevokePreview = renderDeterministicPreview(afterRevoke.guidance)
    output.write(`${afterRevokePreview.label}: ${afterRevokePreview.mode} — ${afterRevokePreview.text}\n`)
    output.write('演练完成\n')
    return 0
  } catch {
    output.write('演练无法完成。\n')
    return 1
  } finally {
    readline.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const code = await runGuidedWalkthrough({ input: process.stdin, output: process.stdout })
  if (code !== 0) process.exitCode = code
}
