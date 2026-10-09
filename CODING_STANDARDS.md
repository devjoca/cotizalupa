# Coding standards

Read this when writing or reviewing code. AGENTS.md owns product scope, flow, and safety.

## Simplicity

- Complexity belongs at the adapter boundary (payments, OpenAI, bucket). Order logic
  stays plain: status values in the DB plus conditional updates, no state-machine library.
- KISS first: smallest diff that does the task. No speculative layers, no
  "while I'm here" refactors.
- Pre-refactor only if it makes this change easier or removes slop you are
  touching. Otherwise leave it and say so in one sentence.
- Wider split/rename/abstract → stop and ask via the question tool (minimal now
  vs refactor-first, with cost/payoff). Never bundle silent refactors into a fix/feature.

## Gaps and unknowns

- No speculative gaps: 0–3 strong gaps beat 8 invented ones. Unknown fields are
  `null`, never inferred. The prompt rule and `parseAnalysis` both enforce this.
  Never fabricate findings.

## Types

- Prefer the narrowest type that carries the meaning; `any` and empty interfaces
  are the enemy.

## Comments

- Comments describe how a thing is used and move when the code moves. Annotate
  decisions (why this boundary, why this order), not every line.

## Tests

- Test meaningful logic or observable behavior: state transitions, idempotency,
  immutability, reclaim. Do not assert component markup, callback wiring, or mirrors
  of the implementation.
- Async flows await receipts and drains (`processNext()` outcomes), never sleeps
  or polling. A test that needs a timeout to pass is wrong.

## Verifying

- Smallest proof the change works; say what you actually ran. No repo-wide
  checks unless asked (CI not wired; Joca owns it). No browser/computer-use
  verification unless agreed.
- No paid eval runner. Synthetic fixtures only for free tests; paid model calls
  need explicit authorization. Review a few model-generated reports manually
  before selling.

## Test data

- Default to `fixtures/` (see `fixtures/README.md`); synthetic docs generated
  in memory, no real quotation in the fixture set. Never copy prod originals
  into a sandbox — reconstruct a synthetic equivalent.
- Copy in, never symlink. Secrets only if the flow needs them; never print them.

## Security

- Harden payment verification and report-token lookup. Elsewhere prefer
  simplicity over hardening.

## Language

- Code, docs, commits, and agent chatter in English. Anything the user reads
  (UI, reports, emails) in es-PE.
