# Backend Provider, OpenAPI, and CI Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock Trustap v1, Shippo 2018-02-08, webhook, cron, OpenAPI/Insomnia, coverage, and CI behavior into deterministic merge gates.

**Architecture:** Provider services validate local stub traffic and response bodies at their boundary. Webhooks authenticate with dedicated HTTP Basic credentials and apply monotonic v1 state transitions. Cron routes retain their existing URLs but use only job secrets. Every mounted Hono operation receives OpenAPI metadata, and a generated JSON artifact is checked in CI against the executable route registry.

**Tech Stack:** Hono, Zod, Vitest, Node crypto/HTTP, Trustap API v1, Shippo SDK/API 2018-02-08, hono-openapi, Scalar, GitHub Actions, Docker/Testcontainers.

---

**Depends on:** Plans 01–03.

**Approved design:** `docs/superpowers/specs/2026-08-30-backend-api-verification-design.md`

**Primary references:**

- [Trustap v1 online transactions](https://docs.trustap.com/apis/openapi/online-transactions)
- [Trustap webhooks](https://docs.trustap.com/docs/concepts/webhooks)
- [Shippo label transaction](https://docs.goshippo.com/api-reference/transactions/create-a-shipping-label)
- [Shippo shipment creation](https://docs.goshippo.com/api-reference/shipments/create-a-new-shipment)

## File map

### Files created

- `apps/server/src/routes/payments/provider.schemas.ts` — runtime schemas for Trustap v1 charge, guest, and transaction responses.
- `apps/server/src/routes/payments/transaction-status.ts` — Trustap-to-order mapping and monotonic transition rules.
- `apps/server/src/routes/webhooks/basic-auth.ts` — timing-safe Basic credential verification.
- `apps/server/test/providers/trustap-v1.test.ts` — API key/header, fee handshake, response, and failure contracts.
- `apps/server/test/providers/shippo.test.ts` — carrier, shipment/rate, retrieval, and label-purchase contracts.
- `apps/server/test/routes/webhooks.test.ts` — authenticated v1 webhook matrix.
- `apps/server/test/routes/cron.test.ts` — secret, expiry, sync, and idempotency contracts.
- `apps/server/src/openapi/descriptions.ts` — shared response/security schema fragments.
- `apps/server/src/openapi/routes/*.ts` — route-specific operation metadata grouped by router.
- `apps/server/test/contracts/openapi-parity.test.ts` — exact mounted/registry/OpenAPI method-path equality.
- `apps/server/test/contracts/suite-presence.test.ts` — every registry suite resolves to an owned test file.
- `apps/server/scripts/export-openapi.ts` — stable generation and `--check` mode.
- `docs/api/tantovale.openapi.json` — Insomnia-importable generated artifact.
- `.github/workflows/backend-api.yml` — Node 22/Docker API verification gate.

### Files modified

- `apps/server/src/routes/payments/payment-provider.service.ts`, `types.ts`, and `transaction-sync.service.ts`.
- `apps/server/src/routes/shipment-provider/index.ts`, `shipment.service.ts`, `types.ts`, and `describe.ts`.
- `apps/server/src/lib/create-app.ts`, `configureOpenApi.ts`, and `shippo-client.ts`.
- `apps/server/src/routes/webhooks/index.ts` and `apps/server/src/routes/cron/index.ts`.
- Every mounted router under `apps/server/src/routes/` — attach its grouped OpenAPI operation metadata.
- `apps/server/src/env.ts` — dedicated webhook username plus the existing webhook-only secret.
- `apps/server/package.json`, `apps/server/vitest.config.ts`, and `pnpm-lock.yaml`.
- `.github/workflows/daily-orders-check.yml` and `.github/workflows/daily-order-proposals-check.yml` — call mounted cron paths.

## Task 1: Pin and validate Trustap API v1 behavior

**Files:**

- Create payment schema/status and Trustap test files from the file map.
- Modify: `apps/server/src/routes/payments/payment-provider.service.ts`
- Modify: `apps/server/src/routes/payments/types.ts`
- Modify: `apps/server/src/routes/payments/transaction-sync.service.ts`
- Modify: `apps/server/src/utils/platform-costs.ts`

- [ ] **Step 1: Write boundary tests against the local Trustap stub**

Cover:

| Operation          | Required contract                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| create guest user  | POST `/api/v1/guest_users`; Basic API key; integer internal ID and expected identity fields                                                              |
| calculate charge   | GET `/api/v1/charge`; integer-cent `price` and `postage_fee`; currency `eur`; parse charge/version                                                       |
| create transaction | POST `/api/v1/me/transactions/create_with_guest_user`; Basic API key; `Trustap-User`; buyer/seller/role; exact charge/version returned by prior fee call |
| fetch transaction  | GET `/api/v1/transactions/:integerId`; parse v1 integer ID and status                                                                                    |

For each, make the stub return 401, 422/malformed JSON, and 500 in separate cases. The service must throw a redacted typed error; it must not return an unsafe cast or log an API key.

- [ ] **Step 2: Replace response casts with v1 Zod schemas**

Define schemas with integer `id`, `price`, `charge`, and `charge_seller`; string guest IDs; `currency: 'eur'`; and `status: z.enum(entityTrustapTransactionStatusValues)`. Correct the legacy type typos `fund_released`→`funds_released` and `pirce`→`price`. Parse every successful response using `.parse()` before returning it.

- [ ] **Step 3: Enforce the fee handshake**

`calculatePlatformCosts()` must pass `postage_fee` to `calculateTransactionFee()`. The stub records charge tuples keyed by `{ price, currency, postage_fee }` and rejects transaction creation unless its `charge` and `charge_calculator_version` match the earlier result. Tests assert all amounts remain integer cents.

- [ ] **Step 4: Centralize state mapping**

Create this explicit application mapping:

```ts
export const trustapToOrderPhase = {
	created: ORDER_PHASES.PAYMENT_PENDING,
	joined: ORDER_PHASES.PAYMENT_PENDING,
	paid: ORDER_PHASES.PAYMENT_CONFIRMED,
	rejected: ORDER_PHASES.PAYMENT_FAILED,
	cancelled: ORDER_PHASES.CANCELLED,
	tracked: ORDER_PHASES.SHIPPING_CONFIRMED,
	cancelled_with_payment: ORDER_PHASES.PAYMENT_REFUNDED,
	delivered: ORDER_PHASES.COMPLETED,
	payment_refunded: ORDER_PHASES.PAYMENT_REFUNDED,
	complaint_period_ended: ORDER_PHASES.COMPLETED,
	funds_released: ORDER_PHASES.COMPLETED,
} as const;
```

`complained` updates the provider transaction but leaves the current order phase unchanged. Both webhook and sync service must call the same mapper; neither may store a raw Trustap status in `orders.status`.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/providers/trustap-v1.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/routes/payments apps/server/src/utils/platform-costs.ts apps/server/test/providers/trustap-v1.test.ts
git commit -m "test(server): pin Trustap v1 contracts"
```

## Task 2: Correct and verify all Shippo routes

**Files:**

- Create: `apps/server/test/providers/shippo.test.ts`
- Modify shipment files from the file map.

- [ ] **Step 1: Test all three mounted shipping operations**

`shippo.test.ts` covers:

- active carriers filters inactive results and forwards `SHIPPO-API-VERSION: 2018-02-08`;
- shipment calculation constructs seller/buyer addresses and parcel dimensions from the authenticated database graph;
- public `shipment_label_id` equals the parent shipment `object_id` (`shipment-test`), never rate `object_id` (`rate-test`);
- missing item/address/dimensions and Shippo 400/401/500/invalid responses map to controlled API errors;
- label creation rejects unauthenticated, malformed, outsider, wrong-state, unknown-rate, and rate-from-another-shipment calls;
- valid label creation calls Shippo `POST /transactions` with `{ rate: 'rate-test', async: false, label_file_type: 'PDF' }` and returns the successful label result without `object_owner`/`created_by`.

- [ ] **Step 2: Replace the create-label placeholder**

Validate:

```ts
const createLabelSchema = z.object({
	order_id: z.number().int().positive(),
	rate_id: z.string().min(1),
});
```

Require that the authenticated profile is the order seller and status is `payment_confirmed` or `shipping_pending`. Fetch the rate with `ratesGet`; require `rate.shipment === order.shipping_label_id`; purchase using `transactionsCreate`. Return 201 with:

```ts
{
  label: {
    id: transaction.objectId,
    status: transaction.status,
    label_url: transaction.labelUrl,
    tracking_number: transaction.trackingNumber,
    tracking_url: transaction.trackingUrlProvider,
  },
}
```

Do not overwrite the legacy `orders.shipping_label_id`, which intentionally contains the parent shipment ID.

- [ ] **Step 3: Fix address construction without renaming the public response**

Use actual city in Shippo `addressFrom.city`/`addressTo.city` rather than province name. Continue sending region/province separately when present. Keep `shipment_label_id` only as the documented compatibility alias at the Tantovale response boundary.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/providers/shippo.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/routes/shipment-provider apps/server/test/providers/shippo.test.ts
git commit -m "fix(server): purchase Shippo labels from verified rates"
```

## Task 3: Authenticate and order Trustap v1 webhook transitions

**Files:**

- Create: `apps/server/src/routes/webhooks/basic-auth.ts`
- Create: `apps/server/test/routes/webhooks.test.ts`
- Modify: `apps/server/src/routes/webhooks/index.ts`
- Modify: `apps/server/src/env.ts`
- Modify: `apps/server/test/infrastructure/runtime.ts`

- [ ] **Step 1: Write the webhook security/state matrix**

Cover missing/malformed/wrong Basic credentials (401), invalid JSON/status/v2-shaped payload (400), unknown transaction (404), current v1 update (200), duplicate update (200/no additional mutation), and out-of-order update (200/ignored/no regression). Verify both provider-transaction and mapped order states.

Use v1-shaped payloads only:

```ts
{
  event: 'transaction_updated',
  transaction_id: 91001,
  status: 'paid',
  paid: '2026-08-30T12:00:00.000Z',
  complaint_period_deadline: '2026-09-01T12:00:00.000Z',
}
```

The negative v2 fixture contains `code: 'tx.paid'`, a prefixed `target_id`, and `target_preview`; it must fail v1 validation.

- [ ] **Step 2: Add dedicated credentials and timing-safe comparison**

Add `PAYMENT_PROVIDER_WEBHOOK_USERNAME: z.string().default('trustap')` and retain `PAYMENT_PROVIDER_WEBHOOK_SECRET` as the webhook-only password; neither is the Trustap API key. The test runtime supplies explicit non-production values. Parse `Authorization: Basic ...`, split once at the first colon, and compare both components using `timingSafeEqual` only after equal byte lengths are established. Run this middleware before JSON validation.

- [ ] **Step 3: Make transitions idempotent and monotonic**

Validate `status` with `entityTrustapTransactionStatusValues`. Same status returns success without an update. Reject regression such as `paid → joined` or `funds_released → paid` without changing DB state. Update provider transaction and mapped order in one DB transaction. Unknown transaction remains 404 and never creates state.

- [ ] **Step 4: Remove misleading signature code**

Delete the unused `verifyWebhookSignature()` placeholder from `PaymentProviderService`; Trustap's selected contract is HTTP Basic, not an invented HMAC header.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/routes/webhooks.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/env.ts apps/server/src/routes/webhooks apps/server/src/routes/payments/payment-provider.service.ts apps/server/test/infrastructure/runtime.ts apps/server/test/routes/webhooks.test.ts
git commit -m "fix(server): authenticate Trustap webhooks"
```

## Task 4: Make cron endpoints usable and deterministic

**Files:**

- Create: `apps/server/test/routes/cron.test.ts`
- Modify: `apps/server/src/routes/cron/index.ts`
- Modify: `apps/server/src/lib/create-app.ts`
- Modify the two scheduled workflow files listed in the file map.

- [ ] **Step 1: Write cron tests with fake time**

Use `vi.useFakeTimers()` and a fixed UTC time. For each route assert missing/wrong key 401, exact key 200, boundary timestamps, permitted source status, repeated invocation, and no terminal-state regression. For transaction sync, configure the Trustap stub with changed, unchanged, and provider-error transactions and assert result counts plus mapped order state.

- [ ] **Step 2: Preserve paths but use job authentication only**

Keep:

```text
/cron/auth/expired-orders-check
/cron/auth/expired-proposals-check
/cron/auth/sync-transactions
```

Exclude `/cron/auth/` from the application's cookie-auth dispatch and remove explicit `authMiddleware` from these handlers. All three read `key` from `c.req.query()` and compare it with the route-specific configured secret. This deliberate exception keeps the approved paths while making scheduled callers usable without user cookies.

- [ ] **Step 3: Fix GitHub scheduled callers**

Change only the URL path in the two workflows to include `/cron/auth/`. Add `curl --fail-with-body --silent --show-error` so 4xx/5xx responses fail the job. Do not print the key.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/routes/cron.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/routes/cron/index.ts apps/server/src/lib/create-app.ts apps/server/test/routes/cron.test.ts .github/workflows/daily-orders-check.yml .github/workflows/daily-order-proposals-check.yml
git commit -m "fix(server): authenticate scheduled jobs with cron secrets"
```

## Task 5: Describe every mounted route and prove three-way parity

**Files:**

- Create OpenAPI sources and contract tests from the file map.
- Modify every mounted router and `configureOpenApi.ts`.

- [ ] **Step 1: Write failing OpenAPI parity**

Parse `GET /openapi`, convert OpenAPI `{parameter}` segments to Hono `:parameter`, and compare sorted unique `METHOD path` sets:

```ts
expect(openApiOperations).toEqual(mountedOperations);
expect(openApiOperations).toEqual(registryOperations);
expect(openApiOperations).toHaveLength(63);
```

Also assert every operation has non-empty `operationId`, `summary`, success response, applicable 400/401/403/404 responses, tags, and the correct security marker. Operation IDs must be unique.

- [ ] **Step 2: Add reusable security and error descriptions**

Configure components for:

```ts
accessCookie: { type: 'apiKey', in: 'cookie', name: 'access_token' },
refreshCookie: { type: 'apiKey', in: 'cookie', name: 'refresh_token' },
cronKey: { type: 'apiKey', in: 'query', name: 'key' },
trustapWebhookBasic: { type: 'http', scheme: 'basic' },
```

Public operations declare `security: []`; protected routes require both cookie schemes in the same security-requirement object. Cron and webhook routes declare their matching scheme. Define common JSON error schemas, then attach route-specific request/query/path and success schemas. Do not expose secrets or example real identities.

- [ ] **Step 3: Attach descriptions to all 63 pairs**

Group metadata by the registry suite but place `describeRoute(...)` on the actual Hono handler so documentation cannot invent an unmounted operation. Include both documentation routes. Preserve the legacy shipping field description exactly: `shipment_label_id` contains a Shippo shipment object ID used to retrieve rates; it is not a purchased label transaction ID.

- [ ] **Step 4: Prove every suite has an owner**

`suite-presence.test.ts` maps registry suite names to these files and checks they exist:

```ts
const suiteFiles = {
	documentation: 'test/routes/documentation.test.ts',
	authentication: 'test/routes/authentication.test.ts',
	profiles: 'test/routes/profiles.test.ts',
	addresses: 'test/routes/addresses.test.ts',
	catalog: 'test/routes/catalog.test.ts',
	items: 'test/routes/items.test.ts',
	uploads: 'test/routes/uploads.test.ts',
	favorites: 'test/routes/favorites.test.ts',
	chat: 'test/routes/chat.test.ts',
	proposals: 'test/routes/proposals.test.ts',
	orders: 'test/routes/orders.test.ts',
	'platform-costs': 'test/routes/platform-costs.test.ts',
	shipping: 'test/providers/shippo.test.ts',
	cron: 'test/routes/cron.test.ts',
	webhooks: 'test/routes/webhooks.test.ts',
} as const;
```

The test also scans each mapped file for at least one literal route from its registry suite. Coverage thresholds and behavioral review remain necessary; this is a drift guard, not proof by itself.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/contracts/route-parity.test.ts test/contracts/openapi-parity.test.ts test/contracts/suite-presence.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/openapi apps/server/src/lib/configureOpenApi.ts apps/server/src/routes apps/server/test/contracts
git commit -m "docs(server): describe every mounted API route"
```

## Task 6: Generate the canonical Insomnia artifact

**Files:**

- Create: `apps/server/scripts/export-openapi.ts`
- Create: `docs/api/tantovale.openapi.json`
- Modify: `apps/server/package.json`
- Modify: `apps/server/tsconfig.build.json`

- [ ] **Step 1: Write export/check behavior test**

Run generation in a temporary directory, parse JSON, assert 63 operations and no secret-like values, then change one byte and prove `--check` exits non-zero.

- [ ] **Step 2: Implement stable generation**

The script supplies deterministic non-secret documentation env defaults before dynamically importing `app`, requests `http://localhost:4000/openapi`, recursively sorts object keys, appends one newline, and either writes the target or compares it in `--check` mode. Add:

```json
{
	"api:export": "tsx scripts/export-openapi.ts ../../docs/api/tantovale.openapi.json",
	"api:check": "tsx scripts/export-openapi.ts ../../docs/api/tantovale.openapi.json --check"
}
```

Exclude `scripts` from production output in `tsconfig.build.json` while keeping it in package typecheck.

- [ ] **Step 3: Generate, inspect, and commit**

```bash
pnpm --filter @workspace/server api:export
pnpm --filter @workspace/server api:check
pnpm --filter @workspace/server typecheck
git diff --check -- docs/api/tantovale.openapi.json
git add apps/server/scripts/export-openapi.ts apps/server/package.json apps/server/tsconfig.build.json docs/api/tantovale.openapi.json
git commit -m "docs(server): export Insomnia OpenAPI artifact"
```

Import `docs/api/tantovale.openapi.json` into Insomnia once manually and confirm it recognizes cookie, cron-key, and webhook-Basic security schemes. This check is the only manual acceptance step; all artifact drift remains automated.

## Task 7: Enforce coverage and CI merge gates

**Files:**

- Create: `.github/workflows/backend-api.yml`
- Modify: `apps/server/vitest.config.ts`
- Add focused tests only where the coverage report identifies missing runtime behavior.

- [ ] **Step 1: Run coverage before exclusions change**

```bash
pnpm --filter @workspace/server test:api:coverage
```

Keep API runtime code included. The only accepted exclusions are generated Drizzle migration files, database seed scripts, `src/index.ts` TCP bootstrap, type declaration files, and generated build output. Do not exclude a route, middleware, service, validation schema, mailer invoked by routes, or provider adapter to satisfy a number.

- [ ] **Step 2: Add tests until thresholds pass**

Add focused unit cases for uncovered error/branch behavior. Retain thresholds:

```ts
thresholds: { lines: 90, functions: 90, branches: 85 },
```

Run twice with seeds 211 and 307; both must pass.

- [ ] **Step 3: Add the backend workflow**

Create `.github/workflows/backend-api.yml` with pull-request and main-push triggers, `ubuntu-latest`, checkout/setup-node v4, Node 22, Corepack, `pnpm install --frozen-lockfile`, and these commands:

```bash
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
pnpm --filter @workspace/server build
pnpm --filter @workspace/server test:api:coverage -- --sequence.shuffle --sequence.seed=211
pnpm --filter @workspace/server api:check
```

Docker is provided by the GitHub runner. Do not add real provider, AWS, database, SMTP, JWT, webhook, or cron secrets to the workflow.

- [ ] **Step 4: Run the complete local merge proof**

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
pnpm --filter @workspace/server build
pnpm --filter @workspace/server test:api:coverage -- --sequence.shuffle --sequence.seed=211
pnpm --filter @workspace/server test:api -- --sequence.shuffle --sequence.seed=307
pnpm --filter @workspace/server api:check
git diff --check
```

Expected: zero warnings, all 63 routes registered/test-owned/documented, coverage at or above 90/90/85, generated artifact unchanged, and no external connection.

- [ ] **Step 5: Commit CI gate**

```bash
git add .github/workflows/backend-api.yml apps/server/vitest.config.ts apps/server/test
git commit -m "ci: gate backend API contracts"
```

## Final completion criteria

- Trustap traffic is v1-only, uses integer cents and API-key Basic auth, and passes the fee handshake.
- Trustap webhook delivery uses dedicated timing-safe Basic credentials; v2 payloads cannot enter the v1 handler.
- Provider status never gets written directly into the application order-status domain.
- Shippo uses API version 2018-02-08; shipment, rate, and purchased-label transaction IDs are not conflated.
- Cron routes run with job secrets and no user session while retaining the approved URLs.
- Mounted routes, registry, owned test suites, and OpenAPI contain the same 63 method/path contracts.
- `docs/api/tantovale.openapi.json` imports into Insomnia and exactly matches fresh generation.
- CI runs on Node 22 with frozen pnpm dependencies and disposable Docker services only.
- Line/function/branch coverage meets 90/90/85 and all lint/typecheck/build/test commands pass with zero warnings.
