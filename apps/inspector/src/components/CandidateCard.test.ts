// @vitest-environment happy-dom

import { preferenceCandidateFixture } from '@companion-preference/contracts'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import CandidateCard from './CandidateCard.vue'

describe('T12 CandidateCard privacy oracle', () => {
  it('shows review metadata and content-free evidence references without rendering evidence payload text', () => {
    const candidate = {
      ...preferenceCandidateFixture,
      evidenceIds: ['evidence-1', 'evidence-2'],
      counterEvidenceIds: ['counter-evidence-1'],
    }
    const rawChat = 'do not render this raw chat payload or source trace'
    const wrapper = mount(CandidateCard, { props: { candidate } })

    expect(wrapper.get('[data-testid="candidate-id"]').text()).toBe(candidate.id)
    expect(wrapper.get('[data-testid="candidate-preference"]').text()).toContain('interaction.response_detail')
    expect(wrapper.get('[data-testid="candidate-preference"]').text()).toContain('concise')
    expect(wrapper.get('[data-testid="candidate-scope"]').text()).toBe('workspace: workspace-1')
    expect(wrapper.get('[data-testid="candidate-source-hosts"]').text()).toBe('Source hosts: reference-host')
    expect(wrapper.get('[data-testid="candidate-visibility"]').text()).toBe('Visible to: airi, reference-host')
    expect(wrapper.get('[data-testid="candidate-confidence"]').text()).toBe('82% confidence')
    expect(wrapper.get('[data-testid="candidate-created-at"]').text()).toBe(candidate.createdAt)
    expect(wrapper.get('[data-testid="candidate-evidence"]').text()).toBe('Supporting evidence: 2 (evidence-1, evidence-2)')
    expect(wrapper.get('[data-testid="candidate-counter-evidence"]').text()).toBe('Counter evidence: 1 (counter-evidence-1)')
    expect(wrapper.text()).not.toContain(rawChat)
    expect(wrapper.text()).not.toMatch(/assistantText|userText|learningPayload|tool-trace/i)
  })

  it('exposes confirm, edit-confirm, change-scope-confirm, reject, and suppress actions without optimistic state', async () => {
    const wrapper = mount(CandidateCard, { props: { candidate: preferenceCandidateFixture, busy: false } })

    for (const action of ['Confirm', 'Edit and confirm', 'Change scope and confirm', 'Reject', 'Suppress similar'] as const) {
      expect(wrapper.get(`button[aria-label="${action} ${preferenceCandidateFixture.id}"]`).attributes('disabled')).toBeUndefined()
    }
    await wrapper.get(`button[aria-label="Confirm ${preferenceCandidateFixture.id}"]`).trigger('click')
    expect(wrapper.emitted('confirm')).toEqual([[]])
    expect(wrapper.text()).toContain('pending_confirmation')
  })
})
