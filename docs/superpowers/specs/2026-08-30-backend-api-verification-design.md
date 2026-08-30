# Backend API Verification Suite Design

**Status:** Approved

**Date:** 2026-08-30

## Context

Tantovale is a pnpm/Turborepo monorepo. `apps/server` exposes a Hono API backed by PostgreSQL and Drizzle ORM. The current branch upgrades Drizzle and changes database schemas and relations, while the backend has no automated test suite. Before the branch can be merged, every mounted HTTP route must have deterministic contract coverage and the principal C2C workflows must be exercised end to end at the API layer.

The suite must be suitable for local development and future CI execution. It must not call real or sandbox third-party accounts, mutate the developer database, depend on test order, or require secrets outside a generated test environment.

## Goals

- Prove that every unique mounted Hono method/path pair has an explicit test contract.
- Verify status codes, response bodies, headers, cookies, authorization, validation, database effects, and provider interactions.
- Detect discrepancies between the migrated Drizzle schema and API behavior through real PostgreSQL execution and direct database assertions.
- Cover both isolated route behavior and complete business workflows.
- Exercise authentication using real application tokens, cookies, and email contents.
- Exercise S3-compatible storage and SMTP against disposable local services.
- Exercise Trustap and Shippo boundaries against deterministic programmable HTTP stubs.
- Produce a complete, versioned OpenAPI document importable into Insomnia.
- Make additions to the mounted API fail verification until tests and documentation are added.

## Non-goals

- Browser UI testing. Playwright smoke tests remain a separate frontend concern.
- Calling live, sandbox, or developer-owned Trustap, Shippo, AWS, or SMTP services.
- Preserving behavior that is demonstrably incorrect or insecure merely because it is legacy behavior.
- Testing exported but unmounted routers. The empty mounted payments router has no route contract until it exposes a method.
- Standardizing all legacy response shapes as part of the test harness. Existing compatible shapes remain valid unless a route is corrected deliberately.

## Selected approach

The suite will use Vitest, Hono's in-process testing APIs, and Testcontainers:

- Hono requests use `app.request()` for standard cases and `testClient()` where its typed client improves request construction.
- The application is not bound to a TCP port for ordinary route tests.
- Testcontainers manages one PostgreSQL container, one MinIO container, and one Mailpit container per complete run.
- Small programmable local HTTP servers emulate Trustap and Shippo and record outbound requests.
- Tests live under `apps/server/test/` and are divided into infrastructure, fixtures, helpers, contract coverage, route suites, and workflows.

Supertest is not required because Hono natively accepts Fetch API `Request` objects and returns `Response` objects.

## Proposed test structure

```text
apps/server/test/
├── infrastructure/
│   ├── global-setup.ts
│   ├── global-teardown.ts
│   ├── postgres.ts
│   ├── minio.ts
│   ├── mailpit.ts
│   └── provider-stubs.ts
├── fixtures/
│   ├── users.ts
│   ├── catalog.ts
│   ├── items.ts
│   ├── chats.ts
│   └── commerce.ts
├── helpers/
│   ├── auth.ts
│   ├── database.ts
│   ├── mail.ts
│   ├── requests.ts
│   └── assertions.ts
├── contracts/
│   ├── route-registry.ts
│   ├── route-parity.test.ts
│   └── openapi-parity.test.ts
├── routes/
│   └── <one suite per router>
└── workflows/
    ├── authentication.test.ts
    ├── listing-and-favorite.test.ts
    ├── chat-and-proposal.test.ts
    └── purchase-and-order.test.ts
```

Names may be split further during implementation, but the responsibilities and isolation boundaries above are fixed.

## Runtime and lifecycle

`pnpm --filter @workspace/server test:api` owns the complete lifecycle:

1. Start disposable PostgreSQL, MinIO, Mailpit, Trustap stub, and Shippo stub services.
2. Generate a test-only environment containing only local endpoints and ephemeral credentials.
3. Apply the repository's migrations to a PostgreSQL template database.
4. Clone an isolated database from that template for each Vitest worker or test file.
5. Run route and workflow suites.
6. Stop all services and remove their containers, including after a failing test run.

The test database must always have a generated name and must never be `tantovale_dev` or any configured development database. Harness startup aborts if the resolved connection points at a non-test database.

### Database isolation

The PostgreSQL container is initialized once per complete run because container startup and migration are expensive. Isolation is still per worker or test file:

- A migrated template database is immutable after setup.
- Worker databases are cloned from the template.
- Before each isolated test, all application tables are reset with `TRUNCATE ... RESTART IDENTITY CASCADE` and only the fixtures required by that test are inserted.
- Complex multi-step workflows receive their own isolated database.
- Tests must pass with randomized file order and cannot consume records produced by another test.

This design keeps the run fast without allowing shared mutable database state between independent tests.

## Executable route contract registry

The contract registry is the authoritative test inventory. Each entry records:

- normalized HTTP method and path;
- whether authentication is required;
- accepted path, query, JSON, form, and multipart input;
- expected success and error response families;
- relevant cookies and response headers;
- database reads and writes;
- ownership and state-transition rules;
- external services invoked;
- the route suite responsible for the entry.

Hono may expose duplicate `app.routes` entries when middleware and validators are registered. Parity therefore compares unique normalized `METHOD path` pairs. A test fails when:

- a mounted method/path is absent from the registry;
- a registry entry no longer exists in the application;
- a registry entry lacks a route suite;
- a mounted route is missing from OpenAPI;
- OpenAPI declares a route that is neither mounted nor explicitly marked external.

The current baseline is 63 unique mounted method/path pairs, listed in the appendix.

## Per-route test matrix

Every route suite selects all applicable equivalence classes rather than copying one identical checklist blindly:

- successful request with the minimal valid input;
- successful request with the complete valid input;
- meaningful lower, upper, empty, and length boundaries;
- malformed JSON, form data, multipart data, parameters, and query values;
- missing authentication and invalid or expired authentication;
- authenticated user lacking ownership or role permission;
- missing resource and resource owned by another user;
- duplicate data, uniqueness conflicts, and invalid state transitions;
- provider application error, malformed response, timeout, and unavailability;
- response status, content type, body schema, headers, and cookies;
- direct database verification of inserted, updated, hidden, or deleted state;
- verification that rejected requests produce no partial database or object-storage writes.

Tests describe the correct contract. When investigation proves current behavior is incorrect or insecure, the new test may initially fail and the route must be corrected in the same implementation checkpoint before merge.

## Fixtures and assertions

Typed factory fixtures create only the state a test requires. Core factories cover:

- verified and unverified users;
- profiles and active/non-active addresses;
- catalog categories, subcategories, properties, and locations;
- draft and published items with property values and images;
- favorites;
- chat rooms, text messages, and proposal messages;
- proposals, orders, shipping records, and provider transactions.

Authentication helpers obtain tokens and cookies through real application routes. They do not fabricate signed tokens except in focused negative tests for malformed or expired credentials.

Assertions cover both the HTTP contract and persistent effects. Mutation tests read the affected Drizzle tables directly, including relation-backed reads where applicable, to prove that the migrated schema supports the actual route behavior.

## Required workflow tests

### Authentication and password lifecycle

1. Sign up a new user.
2. Read the verification email through the Mailpit API.
3. Extract the verification token or link and verify the email.
4. Log in and capture application cookies.
5. Access a protected route.
6. Refresh authentication and prove the refreshed credentials work.
7. Log out and prove the protected session is no longer accepted.
8. Request a password reset.
9. Read the reset email through Mailpit.
10. Verify the reset token, reset the password, reject the old password, and accept the new password.

The suite also verifies essential email metadata and that tokens cannot be reused after their intended lifecycle.

### Listing and favorite lifecycle

1. Create and authenticate a seller with a valid profile and active address.
2. Create a draft item using valid catalog data.
3. Upload item images to MinIO using the application's multipart route.
4. Edit and publish the item.
5. Authenticate a different buyer and fetch the public item.
6. Add the item to favorites, verify it is listed, remove it, and verify removal.
7. Confirm ownership rules prevent the buyer from editing or deleting the seller's item.

### Chat followed by proposal

1. The buyer creates or obtains the room for the seller's item.
2. The buyer sends a normal text message.
3. The seller fetches the room and message history.
4. The seller replies with a normal text message.
5. Both sides observe the same chronological order, authors, and content.
6. A third authenticated user cannot read or write in the room.
7. Only after the text exchange, the buyer creates a proposal through the proposal flow.
8. The room history preserves both text messages and proposal metadata without changing their meaning or order.

Focused cases also cover an empty message, the maximum accepted message length, a missing room, and a room owned by unrelated participants.

### Proposal, purchase, and order lifecycle

The workflow exercises the permitted proposal and order transitions, direct purchase where supported, platform-cost calculation, shipping calculation and label creation, provider transaction synchronization, buyer cancellation where permitted, and rejection of invalid or repeated transitions. Every step asserts the relevant database state as well as the API response.

## External service boundaries

### MinIO

MinIO is the real S3-compatible service for the suite. Tests verify:

- supported multipart image uploads and content types;
- object naming and persisted image references;
- access and ownership restrictions;
- clean failure for invalid content or unavailable storage;
- absence of orphaned objects or partial database rows after failure.

The application S3 client must accept a test endpoint, region, path-style setting, and ephemeral credentials while preserving production defaults.

### Mailpit

The application sends real SMTP messages to Mailpit. Tests query Mailpit's HTTP API, parse the emitted verification and reset links, and validate recipient, subject, and required link contents. No external mailbox is used.

### Trustap and Shippo

Programmable local HTTP stubs provide success responses, provider-level errors, malformed responses, timeouts, and connection failures. They record outbound requests so tests can assert method, path, headers, and payload without logging secrets.

Both integrations must accept a configured base URL in the test environment. Production defaults remain unchanged.

#### Trustap API v1 contract

Tantovale currently integrates with Trustap API v1 and the test contract is pinned to that version. Tests must not use v2 payloads or identifiers. In particular:

- the sandbox-compatible base path is `/api/v1`;
- transaction IDs are integers, while Trustap v2 uses prefixed string IDs;
- every `price`, `charge`, and postage amount is an integer in the currency's smallest unit;
- API-key authentication is HTTP Basic with the API key as the username and an empty password;
- user-scoped client operations also send the documented `Trustap-User` header;
- `POST /guest_users` returns `201` with `created_at`, `email`, and a string user `id`, or a documented `400` response;
- `GET /charge` returns the exact `charge` and `charge_calculator_version` later supplied when creating the transaction;
- `POST /me/transactions/create_with_guest_user` returns `201` with the v1 online transaction object;
- `GET /transactions/{transaction_id}` returns that same v1 object family and can return `400`, `403`, or `404` as applicable.

The v1 transaction fixture includes correctly named official fields such as `price` and `funds_released`; it must not copy the current local type typos `pirce` or `fund_released`. Provider responses are parsed with runtime schemas derived from the pinned v1 contract so a malformed `200` response cannot silently enter the database.

The Trustap stub validates the fee handshake: the charge and calculator version used to create a transaction must match the earlier `/charge` response for the same price, currency, and postage. It also verifies integer cents, Basic authentication, `Trustap-User`, buyer and seller IDs, role, and postage.

#### Shippo API contract

The integration is pinned to Shippo API version `2018-02-08`, matching the configured SDK client. Stub fixtures reproduce the official resource distinction:

- `GET /carrier_accounts` returns a paginated `results` array; Tantovale exposes only entries whose `active` field is true;
- `POST /shipments` returns `201` with a shipment `object_id`, a shipment status, messages, and a `rates` array when the request is synchronous;
- each rate has its own `object_id`, decimal-string `amount`, currency, provider data, and a `shipment` field containing the parent shipment ID;
- `GET /shipments/{shipment_id}` retrieves the shipment and its rates;
- `POST /transactions` purchases the label using a rate `object_id` and returns `201` with transaction status, `label_url`, tracking data, and the purchased rate;
- non-successful Shippo responses use their documented HTTP status and error body rather than a successful response containing invented empty data.

The public `calculate_shipment_cost` response currently calls the parent shipment ID `shipment_label_id`. That name is compatibility-sensitive because proposal creation sends it back and the server retrieves the shipment by that value. Tests therefore preserve the public field temporarily but prove that its value equals Shippo's shipment `object_id`, not a rate ID or purchased-label transaction ID. The OpenAPI description must document this legacy semantic mismatch.

`POST /shipment_provider/auth/create_label` is currently a non-functional placeholder: it uses hard-coded identifiers and addresses, does not purchase a Shippo transaction, and always returns an empty rates array. Its test defines the correct behavior: accept a rate identifier belonging to the authenticated order flow, call Shippo `POST /transactions`, and return the purchased-label result without exposing provider-owner fields. This correction is part of the shipping checkpoint and is not treated as an existing valid contract.

### Cron routes

Cron tests verify secret enforcement, expiry selection, permitted state transitions, repeated invocation, and idempotency. A repeated cron request must not create duplicate transactions or regress terminal state.

### Trustap webhook

Trustap documents HTTP Basic Authentication for webhook delivery, using a username and password configured in the Trustap Dashboard. It does not require Tantovale to invent an `X-Trustap-Signature` algorithm. The current unauthenticated webhook route and the unused placeholder signature method are merge blockers. The suite defines the secure behavior:

- reject a missing, malformed, or invalid Basic Authorization header;
- compare credentials using timing-safe value comparison;
- accept only credentials from dedicated webhook environment variables, separate from the Trustap API key;
- process duplicate delivery idempotently;
- prevent an out-of-order event from regressing transaction state;
- handle an unknown transaction explicitly without creating arbitrary state.

The payload schema and status fixtures are pinned to Trustap v1. Trustap v2's `tx.*` event codes, `target_id`, and nested `target_preview` shape must not be accepted accidentally by the v1 handler. Because Trustap does not automatically retry failed deliveries, the existing transaction-sync cron remains the tested recovery mechanism.

## OpenAPI and Insomnia

The existing `/openapi` output is partial because only some routes are described. All 63 mounted method/path pairs must receive accurate OpenAPI operations, including:

- authentication and cookie requirements;
- path and query parameters;
- JSON and form request bodies;
- multipart upload bodies;
- success and relevant error response schemas;
- local development server configuration;
- descriptions sufficient to execute requests from Insomnia.

`pnpm --filter @workspace/server api:export` writes the deterministic, versioned artifact:

```text
docs/api/tantovale.openapi.json
```

The document contains no tokens, cookies, credentials, real email addresses, or provider secrets. Insomnia imports this OpenAPI file directly; a separate hand-maintained Insomnia collection is deliberately avoided so API documentation cannot drift in two places.

## Package scripts

The server package exposes:

```text
pnpm --filter @workspace/server test
pnpm --filter @workspace/server test:api
pnpm --filter @workspace/server test:api:watch
pnpm --filter @workspace/server test:api:coverage
pnpm --filter @workspace/server api:export
```

- `test` is the package's normal deterministic test entry point.
- `test:api` owns disposable infrastructure and runs the complete backend suite.
- `test:api:watch` reuses a developer test session while preserving per-test database reset.
- `test:api:coverage` produces Vitest V8 coverage.
- `api:export` produces the committed OpenAPI artifact.

The initial testing dependencies are Vitest, `@vitest/coverage-v8`, and Testcontainers. Existing Hono and Node server packages provide the request and local-stub primitives.

## CI gates

A future CI job runs on Node 22 with a frozen pnpm install and Docker available. Merge readiness requires:

- every unique mounted route registered and tested;
- exact parity between mounted routes, the contract registry, and OpenAPI;
- all isolated route and workflow tests passing;
- server lint and typecheck passing with zero warnings;
- the suite passing under randomized test-file order;
- no connection to non-disposable databases or external providers;
- minimum 90% line coverage;
- minimum 90% function coverage;
- minimum 85% branch coverage;
- the committed OpenAPI artifact matching fresh generation.

Coverage thresholds complement route parity; they do not replace behavioral assertions.

## Security and diagnostics

- Test logs redact authorization headers, cookies, tokens, reset links, SMTP credentials, object-storage credentials, and provider secrets.
- Failing assertions may identify a fixture user or transaction by generated test ID but never print secret values.
- Provider stubs expose recorded requests only to the current test process.
- Containers bind to ephemeral local ports.
- Harness startup validates all resolved service hosts as disposable/local test services.
- Teardown is registered before migrations or tests begin, so partial setup is also cleaned up.

## Implementation checkpoints

Implementation proceeds in independently green checkpoints:

1. Vitest harness, Testcontainers, migrations, environment guards, and isolated databases.
2. Mounted-route inventory, executable registry, authentication helpers, and parity gate.
3. Authentication, verification, refresh, logout, and password lifecycle.
4. Categories, subcategories, properties, property values, and locations.
5. Profiles and addresses.
6. Items, uploads, images, and favorites.
7. Chat text exchange followed by proposal messaging.
8. Orders, purchases, proposal state transitions, and platform costs.
9. Shippo, Trustap, webhooks, and cron behavior.
10. Complete OpenAPI descriptions, export command, Insomnia artifact, and coverage gates.

If a checkpoint exposes incorrect application behavior, its tests remain the specification and the backend correction is included in that checkpoint. Each checkpoint must pass before work moves to the next one.

## Acceptance criteria

The work is complete when a clean checkout with Node 22, pnpm, and Docker can run one command and deterministically demonstrate all of the following:

- disposable services start and stop without touching the development database;
- all 63 baseline mounted routes have explicit contract coverage;
- database writes and relation-backed reads succeed against migrated PostgreSQL;
- seller, buyer, and unauthorized-user boundaries behave correctly;
- seller listing, buyer favorite, bidirectional text chat, proposal, purchase, and order flows pass;
- email verification and password reset use actual emitted email contents;
- upload, shipping, payment, webhook, and cron failure modes are controlled and asserted;
- route registry and OpenAPI parity checks pass;
- lint, typecheck, tests, and coverage thresholds pass;
- `docs/api/tantovale.openapi.json` is current and imports into Insomnia.

## Appendix: mounted route baseline

### Documentation

- `GET /`
- `GET /openapi`

### Authentication, verification, and password

- `GET /user/auth`
- `GET /verify`
- `GET /verify/email`
- `GET /password/auth/reset-verify-token`
- `POST /signup`
- `POST /login`
- `POST /logout/auth`
- `POST /refresh/auth`
- `POST /password/forgot-password`
- `POST /password/auth/reset`

### Profile and addresses

- `GET /profile/auth`
- `GET /profile/auth/profile_active_address_id`
- `GET /profile/compact/:username`
- `PUT /profile/auth`
- `GET /addresses/auth/addresses_profile`
- `GET /addresses/auth/default_address`
- `POST /addresses/auth/add_address_to_profile`
- `PUT /addresses/auth/hide_address_from_profile`
- `PUT /addresses/auth/update_address_to_profile`

### Catalog and locations

- `GET /categories`
- `GET /subcategories`
- `GET /subcategories/:id`
- `GET /subcategories/no_parent/:id`
- `GET /properties/:id`
- `GET /properties/subcategory_properties/:id`
- `GET /subcategory_properties/:id`
- `GET /subcategory_properties/filter/:id`
- `GET /locations/search`
- `GET /locations/search_by_id/:locationType/:locationId`

### Items and favorites

- `GET /item/:id`
- `GET /items/:username`
- `GET /items/auth/user/favorites`
- `POST /item/auth/buy_now`
- `POST /item/auth/new`
- `POST /item/auth/publish_state`
- `POST /item/auth/user_delete_item`
- `POST /items/auth/user/selling_items`
- `PUT /item/auth/edit/:id`
- `GET /favorites/auth/check/:item_id`
- `POST /favorites/auth/handle`
- `POST /uploads/auth/images-item`

### Chat

- `GET /chat/auth/rooms`
- `GET /chat/auth/rooms/:roomId/messages`
- `GET /chat/auth/rooms/id/:item_id`
- `POST /chat/auth/rooms`
- `POST /chat/auth/rooms/:roomId/messages`

### Orders and proposals

- `GET /orders/auth/:id`
- `GET /orders/auth/status/:status`
- `GET /orders_proposals/auth/:id`
- `GET /orders_proposals/auth/by_item/:item_id`
- `POST /orders_proposals/auth/buyer_aborted_proposal`
- `POST /orders_proposals/auth/create`
- `PUT /orders_proposals/auth`
- `POST /platforms_costs/auth/calculate_platform_costs`

### Shipping, cron, and webhooks

- `GET /shipment_provider/auth/active_carriers`
- `POST /shipment_provider/auth/calculate_shipment_cost`
- `POST /shipment_provider/auth/create_label`
- `GET /cron/auth/expired-orders-check`
- `GET /cron/auth/expired-proposals-check`
- `GET /cron/auth/sync-transactions`
- `POST /webhooks/trustap/transaction-update`

## References

- [Hono testing guide](https://hono.dev/docs/guides/testing)
- [Hono testing helper](https://hono.dev/docs/helpers/testing)
- [Hono application API](https://hono.dev/docs/api/hono)
- [Hono validation guide](https://hono.dev/docs/guides/validation)
- [Trustap API v1 online transactions](https://docs.trustap.com/apis/openapi/online-transactions)
- [Trustap v1 to v2 differences](https://docs.trustap.com/docs/intro/upgrade)
- [Trustap webhook authentication and reliability](https://docs.trustap.com/docs/concepts/webhooks)
- [Shippo API reference overview and versioning](https://docs.goshippo.com/api-reference/overview)
- [Shippo carrier-account response](https://docs.goshippo.com/api-reference/carrier-accounts/list-all-carrier-accounts)
- [Shippo shipment and rates response](https://docs.goshippo.com/api-reference/shipments/create-a-new-shipment)
- [Shippo label-purchase transaction](https://docs.goshippo.com/api-reference/transactions/create-a-shipping-label)
