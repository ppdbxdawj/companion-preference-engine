# Security policy

This is an experimental, local-first development preview. It is not yet a
network service and should not be used as a production data store.

## Reporting a vulnerability

Please do not open a public issue for a security-sensitive report. Until a
private advisory channel is configured, contact the repository owner through
the GitHub profile associated with this repository and include:

- a short description and impact;
- the smallest reproducible example;
- the affected commit or package; and
- any proposed mitigation.

Do not include real user conversations, credentials, tokens, or other private
data. Use synthetic fixtures instead.

## Current boundaries

- The repository has no HTTP server, MCP server, host adapter, or network
  transport.
- The in-memory repository is process-local. Snapshots can contain live
  evidence before deletion and must be treated as sensitive.
- Audits, mutation receipts, policy decisions, and deletion tombstones are
  designed to be content-free; this is tested, not a guarantee for future
  adapters.
- The default connection policy is deny-by-default.

Security fixes should include a regression test and update the relevant
privacy or threat-model documentation.
