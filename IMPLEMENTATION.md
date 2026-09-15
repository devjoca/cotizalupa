# CotizaLupa — implementation record

`PLAN.md` is guidance, not frozen spec. This file records what we actually
built and decided, and where we diverged. Update it in place when a decision
changes — do not append a second account.

## Stack (actual, scaffolded 2026-09-15)

| Layer | PLAN said | We run | Why different |
|---|---|---|---|
| TanStack Start | 1.168 | `@tanstack/react-start` 1.168.54 (latest) | — |
| TanStack Router | (implied 1.168) | `@tanstack/react-router` 1.170.36 | react-start@1.168.54 declares exactly this; our own 1.168.26 pin loaded a second copy and 500'd dev SSR (D2) |
| React | 19.3 | 19.3.0 | — |
| Node | 24 LTS | 24.16.0, `.nvmrc` = `24`, `engines >= 24` | — |
| pnpm | (implied current) | 12.4.1 via mise `pnpm@latest`, `packageManager` pinned | Shell had 9.15.4; scaffold workspace format needs ≥10 (D1) |
| Drizzle | 0.45 / kit 0.31 | `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10 | — |
| Zod | 4 | 4.6.5 | — |
| `pg` | 8.x | 8.23.0 | — |
| `unpdf` / `file-type` | 1.x / 22 | 1.8.1 / 22.1.0 | — |
| `openai` | 7.x | 7.15.0 | — |
| Vitest | 5 | ^5.0.1 (lockfile: 5.0.1) | exact pin fought pnpm 12's 24h minimum-release-age policy on publish day (D3) |

Rule going forward: versions float within PLAN's majors unless a
known-bad interaction says otherwise. New divergences go in the log below,
not in `PLAN.md`.

## Decision log

### D1 — pnpm 12 via mise (2026-09-15)
Scaffold's `pnpm-workspace.yaml` (`allowBuilds` format) is unreadable by the
shell's pnpm 9 (`packages field missing or empty`). First verified with one-off
pnpm 10, then migrated fully: mise `pnpm@latest` → 12.4.1, `packageManager`
pinned, legacy `pnpm.onlyBuiltDependencies` removed (workspace file is the
source of truth). If `pnpm --version` still shows 9 in some shell, that shell
is resolving the old shim — mise exec shows 12.4.1.

### D2 — Router follows Start's declared deps, not PLAN's line (2026-09-15)
Symptom: dev SSR 500 `{"status":500,"unhandled":true,"message":"HTTPError"}`,
cause `TypeError: object is not iterable` in `handleServerRoutes`
(`@tanstack/start-server-core`). Root: our `@tanstack/react-router@1.168.26`
pin vs `1.170.36` required by `@tanstack/react-start@1.168.54` → two router
copies at runtime. Fix was dependency alignment in `package.json`, no code
change. Lesson: "1.168" names the Start package only; TanStack siblings are
independently versioned and the Start package pins them exactly — deleting or
downgrading those pins reintroduces the duplicate-copy 500.

### D3 — Vitest as a range, fresh lockfile (2026-09-15)
pnpm 12's default `minimum-release-age` (24h) rejected same-day publishes in
the committed lockfile (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`). Relaxing the
policy repo-wide was rejected (it's real protection for money-handling code);
instead loosened the one exact-pinned violator (`vitest` → `^5.0.1`) and
rebuilt the lockfile. Policy now passes on plain commands. Expect this friction
again on any day we add a brand-new release — that's the policy working.

### D4 — Scaffold source (2026-09-15)
`@tanstack/cli create` (the old `create-start` is deprecated), blank template,
Railway adapter, no toolchain, no git, deps installed after. Skeleton added on
top: `src/server/*`, `src/db/*`, `src/lib/schemas.ts` (real `PrecheckSchema`),
`/r/$token` stub, `tests/lifecycle.test.ts` (12 skipped cases from PLAN),
`ops/queries.sql` stubs, `fixtures/README.md`, mockup copied to
`docs/mockup/` (read-only reference). Verified: install, `vitest run`
(12 skipped / 0 failed), `vite build`, dev SSR 200 on `/` and `/r/:token`.

### D5 — Landing serves the mockup verbatim (2026-09-15)
`/` renders `docs/mockup/index.html`'s body (imported `?raw`) with its
stylesheet and vanilla JS from `public/mockup/`, injected by effect because
the script runs top-level and `innerHTML` scripts don't execute. Starter
`main`/`body` CSS was trimmed to a box-sizing reset so it can't fight the
mockup's own typography. Temporary until the landing/upload flow is rebuilt
in React (phase 1); the served copy is `public/mockup/`, the reference
original stays in `docs/mockup/` — keep them in sync by re-copying, or delete
both when React takes over.

### D6 — AGENTS.md encodes Joca's taste (2026-09-15)
Two interview rounds replaced the opinionated defaults: ask at forks (never
guess on product/architecture), short written plan + approval before
multi-step work, walkthrough reports, findings-reported-not-fixed unless
trivial, EN inside / es-PE outside, tests mandatory only for money + states +
idempotency + immutability, commits only on explicit ask.

## Phase status

- [x] 0. Scaffold (this file's baseline)
- [ ] 1. Core: Neon/Drizzle live, bucket, upload, mechanical validation, orders, pre-check
- [ ] 2. Producto: Astra → Zod → report, `quotation_facts`, `processNext()`, `/r/{token}`
- [ ] 3. Money: Izipay sandbox, idempotency, Yape + card, callbacks
- [ ] 4. Producción: `delete_after` sweep, retries, privacy policy, manual boleta, real-money test + manual refund

## Open questions (carried from PLAN)

Izipay, before phase 1: IPN retries, query API, refund API, minimum billing
fields. Flag anything that answers them sooner.
