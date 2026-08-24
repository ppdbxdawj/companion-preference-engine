# T12 Pending and Profile Inspector Design

## Decision

T12 makes candidate review and confirmed preferences visible in the Inspector.
Candidates remain proposals until the user confirms a runtime transaction;
confirmed preferences are shown separately as the active profile. The browser
does not decide preference truth or mutate state locally.

## Privacy-first candidate review

Candidate cards show the proposed preference, scope, projection visibility,
confidence as supporting information, content-free `sourceHostIds`, timestamp,
and counts/IDs for supporting and counter evidence. `sourceHostIds` is
persisted candidate metadata, not a UI inference from audit history or an
evidence-content lookup. Cards do not render raw chat text or raw evidence
payloads. This preserves user review without turning the Inspector into a
general conversation archive.

Available actions are confirm, edit then confirm, change scope then confirm,
reject, and suppress similar candidates. Every action includes the frozen
action/revision fields and waits for the runtime response; no card becomes
active optimistically.

## Pending and Profile behavior

The Pending page polls only while visible. After a successful candidate action,
it refreshes both pending candidates and the active profile. Conflict responses
refresh canonical data rather than overwriting it. Suppression means do not
show a similar future proposal; it is not deletion and does not disable
learning.

The Profile page displays only active records, grouped by work/companion domain
and scope. Its host/session/domain applicability context is explicit
development configuration, never fabricated by the page. Each entry includes
authority, revision, visibility, and content-free evidence references. Revise
atomically supersedes a record; revoke waits for the runtime transaction before
removing it from the display.

## Boundaries and verification

T12 verifies empty/loading/error states, non-optimistic commands, conflict
refreshes, grouping, identity/domain isolation, and no browser credential or
storage access. It does not add evidence text viewing, export, deletion,
reset, AIRI integration, proactive behavior, or a model provider.
