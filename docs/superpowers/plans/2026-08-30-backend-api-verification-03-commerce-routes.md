# Backend Commerce Route Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove every item, upload, favorite, chat, proposal, order, and platform-cost route through two-user C2C workflows backed by PostgreSQL, MinIO, Mailpit, and deterministic provider stubs.

**Architecture:** Seller and buyer use separate cookie jars and resources keyed by profile IDs. Local per-worker HTTP stubs provide successful Trustap v1 and Shippo 2018-02-08 responses without real accounts. Route tests assert HTTP contracts and database/object-storage effects; workflows cross route boundaries and require ordinary text chat before a proposal.

**Tech Stack:** Hono, Vitest, Drizzle ORM, PostgreSQL, MinIO/S3 SDK, Mailpit, Node HTTP stubs, Trustap API v1, Shippo SDK 2.15/API 2018-02-08.

---

**Depends on:** Plans 01 and 02.

**Approved design:** `docs/superpowers/specs/2026-08-30-backend-api-verification-design.md`

## File map

### Files created

- `apps/server/test/infrastructure/provider-stubs.ts` — per-worker Trustap and Shippo servers, request capture, reset, and scenario selection.
- `apps/server/test/helpers/providers.ts` — safe worker-local stub controls and captured-request readers.
- `apps/server/test/fixtures/providers/trustap-v1.ts` — version-pinned successful v1 bodies.
- `apps/server/test/fixtures/providers/shippo-2018-02-08.ts` — SDK-compatible carrier, shipment, rate, and transaction bodies.
- `apps/server/test/fixtures/commerce.ts` — seller/buyer/address/item/image/proposal/order graphs.
- `apps/server/test/routes/items.test.ts` — all item and item-list routes.
- `apps/server/test/routes/uploads.test.ts` — MinIO multipart route.
- `apps/server/test/routes/favorites.test.ts` — both favorite routes.
- `apps/server/test/routes/chat.test.ts` — all five chat routes.
- `apps/server/test/routes/proposals.test.ts` — all five proposal routes.
- `apps/server/test/routes/orders.test.ts` — both order routes.
- `apps/server/test/routes/platform-costs.test.ts` — platform-cost endpoint and Trustap charge call.
- `apps/server/test/workflows/listing-favorite-chat-proposal.test.ts` — primary seller/buyer workflow.
- `apps/server/test/workflows/buy-now-order.test.ts` — alternate immediate-purchase workflow.

### Files modified

- `apps/server/test/infrastructure/runtime.ts`, `global-setup.ts`, and `apps/server/test/setup.ts` — worker-specific provider URLs and reset.
- `apps/server/src/env.ts` and `apps/server/src/lib/shippo-client.ts` — configurable Shippo base URL.
- `apps/server/src/routes/item/index.ts` — ownership, public error handling, complete edit, and transactional mutations.
- `apps/server/src/routes/items/index.ts` — profile-ID filtering and correct absent-user response.
- `apps/server/src/routes/uploads/index.ts` — item ownership and MinIO/DB consistency.
- `apps/server/src/routes/favorites/index.ts` — owner-scoped idempotent add/remove.
- `apps/server/src/routes/chat/index.ts` — participant checks and profile-ID read tracking.
- `apps/server/src/routes/orders-proposals/index.ts` — buyer/seller authorization and state guards.
- `apps/server/src/routes/orders/index.ts` — buyer/seller authorization and profile-ID queries.

## Task 1: Add isolated local Trustap and Shippo success stubs

**Files:**

- Create provider infrastructure and fixture files from the file map.
- Modify `apps/server/test/infrastructure/runtime.ts`
- Modify `apps/server/test/infrastructure/global-setup.ts`
- Modify `apps/server/test/setup.ts`
- Modify `apps/server/src/env.ts`
- Modify `apps/server/src/lib/shippo-client.ts`
- Create `apps/server/test/infrastructure/provider-stubs.test.ts`

- [ ] **Step 1: Write the failing stub contract test**

The test starts one stub pair, calls the endpoints below, and asserts status, captured method/path/body, Basic auth, and Shippo API-version header:

```text
POST /api/v1/guest_users
GET  /api/v1/charge?price=10000&currency=eur&postage_fee=750&use_hr_post=false
POST /api/v1/me/transactions/create_with_guest_user
GET  /api/v1/transactions/91001
GET  /carrier_accounts
POST /shipments
GET  /shipments/shipment-test
POST /transactions
```

- [ ] **Step 2: Implement a reusable local server**

`startProviderStub(kind)` returns `{ url, close }`. Bind only to `127.0.0.1` on port `0`; parse JSON with a byte limit; expose these control endpoints only on the local server:

```ts
type StubScenario = 'success' | 'unauthorized' | 'invalid-payload' | 'provider-error';
type CapturedRequest = { method: string; path: string; headers: Record<string, string>; body: unknown };

POST /__test/reset
POST /__test/scenario   { "scenario": "success" }
GET  /__test/requests
```

The default Trustap transaction fixture uses numeric ID `91001`, integer-cent `price`, `charge`, and `postage_fee`, and status `created`. The Shippo shipment fixture uses `object_id: 'shipment-test'`; its first rate uses `object_id: 'rate-test'`, `shipment: 'shipment-test'`, amount `'7.50'`, and currency `EUR`. The purchased-label transaction uses `object_id: 'label-transaction-test'`, status `SUCCESS`, rate `rate-test`, label URL under `https://labels.test/`, and tracking number `TRACK-TEST-1`.

- [ ] **Step 3: Provide one pair per Vitest worker**

Extend the serializable runtime with:

```ts
providers: {
  trustapUrls: string[];
  shippoUrls: string[];
};
```

Global setup starts four pairs, retains their non-serializable `close` functions locally, and provides only URL arrays. Its teardown closes all eight servers before stopping containers. `buildServerEnvironment(..., workerIndex)` sets:

```ts
PAYMENT_PROVIDER_API_URL: runtime.providers.trustapUrls[workerIndex],
SHIPPING_PROVIDER_API_URL: runtime.providers.shippoUrls[workerIndex],
```

The test setup selects the current worker index and calls `/__test/reset` on both stubs in `beforeEach` alongside database and bucket cleanup.

- [ ] **Step 4: Make Shippo's endpoint configurable**

Add `SHIPPING_PROVIDER_API_URL: z.url().optional()` to `EnvSchema` and configure:

```ts
export const shippoClient = new ShippoCore({
	apiKeyHeader: environment.SHIPPING_PROVIDER_API_KEY,
	shippoApiVersion: '2018-02-08',
	serverURL: environment.SHIPPING_PROVIDER_API_URL,
});
```

No value preserves Shippo's production default.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/infrastructure/provider-stubs.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/env.ts apps/server/src/lib/shippo-client.ts apps/server/test/infrastructure apps/server/test/helpers/providers.ts apps/server/test/fixtures/providers
git commit -m "test(server): emulate commerce providers locally"
```

## Task 2: Build reusable commerce fixtures

**Files:**

- Create: `apps/server/test/fixtures/commerce.ts`
- Create: `apps/server/test/fixtures/commerce.test.ts`

- [ ] **Step 1: Write a failing graph test**

Create seller and buyer users whose numeric user IDs deliberately differ from their profile IDs. Give each an active address, give each profile a distinct Trustap guest ID, and create a published, available, easy-pay shipping item owned by the seller. Read back its Drizzle relations and assert both address FKs, owner profile, subcategory, properties, and images.

- [ ] **Step 2: Implement typed builders**

Export:

```ts
createCommerceActors(): Promise<{
  seller: UserFixture & { jar: CookieJar; address: SelectAddress };
  buyer: UserFixture & { jar: CookieJar; address: SelectAddress };
  outsider: UserFixture & { jar: CookieJar; address: SelectAddress };
  catalog: CatalogFixture;
}>;

validItemBody(actorGraph, overrides?): createItemTypes;
createItemFixture(actorGraph, overrides?): Promise<SelectItem>;
createImageFixture(itemId, size, orderPosition?): Promise<SelectItemImage>;
createProposalFixture(...): Promise<SelectOrderProposal>;
createOrderFixture(...): Promise<SelectOrder>;
```

The item description is at least 50 characters, price is integer cents, address belongs to the seller, all property values belong to properties mapped to the chosen subcategory, and shipping dimensions are non-zero.

- [ ] **Step 3: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/fixtures/commerce.test.ts --config vitest.config.ts
pnpm --filter @workspace/server typecheck
git add apps/server/test/fixtures/commerce.ts apps/server/test/fixtures/commerce.test.ts
git commit -m "test(server): add two-party commerce fixtures"
```

## Task 3: Verify all item and listing routes, including edit

**Files:**

- Create: `apps/server/test/routes/items.test.ts`
- Modify: `apps/server/src/extended_schemas/item/index.ts`
- Modify: `apps/server/src/routes/item/index.ts`
- Modify: `apps/server/src/routes/items/index.ts`

- [ ] **Step 1: Write the nine-route item matrix**

| Route                                 | Required assertions                                                                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /item/:id`                       | public published detail with relations/images; authenticated buyer proposal/order projection; 400 malformed; 404 absent/unpublished; malformed optional access cookie behaves as guest |
| `POST /item/auth/new`                 | 201 and atomic item/property rows; pickup forbids shipping price; shipping requires dimensions/price; unknown/mismapped/omitted required property rejected; own address required       |
| `PUT /item/auth/edit/:id`             | owner changes allowed fields/properties; other user and deleted item 404; invalid body 400                                                                                             |
| `POST /item/auth/publish_state`       | owner toggles; other user 404; DB matches response                                                                                                                                     |
| `POST /item/auth/user_delete_item`    | owner soft-deletes/unpublishes; second delete and other user 404                                                                                                                       |
| `POST /item/auth/buy_now`             | buyer success delegated to Task 7; own/unavailable/duplicate order rejected                                                                                                            |
| `GET /items/:username`                | only public available items; grouping does not duplicate items; 404 unknown user                                                                                                       |
| `POST /items/auth/user/selling_items` | filters the authenticated profile by published state, not numeric user ID                                                                                                              |
| `GET /items/auth/user/favorites`      | empty array and populated cards with only available published items                                                                                                                    |

- [ ] **Step 2: Define and implement the edit contract**

Add:

```ts
export const updateItemSchema = createItemSchema
	.extend({ commons: createItemSchema.shape.commons.partial() })
	.partial()
	.refine((value) => Object.keys(value).length > 0, 'At least one item field is required');
```

The handler must:

1. parse a positive item ID;
2. query by item ID plus `c.var.user.profile_id` and `deleted_at IS NULL`;
3. validate a replacement address belongs to that same profile;
4. validate subcategory/property mappings as the create handler does;
5. update item fields and replace property join rows in one transaction;
6. return `{ message: 'Item updated successfully', item_id }` with 200.

Do not permit clients to update `profile_id`, status, timestamps, or `deleted_at` through this route.

- [ ] **Step 3: Correct existing ownership and error defects**

- In easy-pay item creation, scope active-address lookup to the authenticated profile.
- In public item detail, catch malformed optional JWT and continue as a guest; return 404 rather than 500 for an absent/unpublished item.
- Use `c.var.user` instead of decoding the same cookie again in selling, publish, and delete handlers.
- Return 404 for an unknown public username.
- Keep response property names used by the storefront.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/routes/items.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/extended_schemas/item/index.ts apps/server/src/routes/item/index.ts apps/server/src/routes/items/index.ts apps/server/test/routes/items.test.ts
git commit -m "test(server): verify item and listing APIs"
```

## Task 4: Verify multipart image upload against MinIO

**Files:**

- Create: `apps/server/test/routes/uploads.test.ts`
- Modify: `apps/server/src/routes/uploads/index.ts`

- [ ] **Step 1: Write the multipart matrix**

Generate a real 32×32 PNG in memory with existing `sharp`. Submit it with `FormData` and assert:

- 201 for the item owner;
- four MinIO keys and four DB rows per source image (`original`, `medium`, `small`, `thumbnail`);
- matching item ID/order positions/content types;
- 400 for missing fields, non-image, oversize file, and malformed item ID;
- 404 for another user's or absent item;
- zero objects/rows after a rejected request.

- [ ] **Step 2: Enforce ownership before object writes**

Use `c.var.user.profile_id`; query the item with both ID and owner profile before processing Sharp or S3. Remove the obsolete `created_by` field from DB values because `items_images` has no such column. Track every successfully written key and delete those keys in the catch path if a later object upload or DB insert fails.

- [ ] **Step 3: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/routes/uploads.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/routes/uploads/index.ts apps/server/test/routes/uploads.test.ts
git commit -m "test(server): verify MinIO item uploads"
```

## Task 5: Verify favorite isolation and idempotency

**Files:**

- Create: `apps/server/test/routes/favorites.test.ts`
- Modify: `apps/server/src/routes/favorites/index.ts`

- [ ] **Step 1: Write both route contracts**

Cover add/check/remove, duplicate add, repeated remove, malformed/absent item, own item, unavailable item, and two users favoriting the same item. Removing buyer A's favorite must not remove buyer B's row.

- [ ] **Step 2: Scope mutations by both foreign keys**

Add is idempotent by checking `(profile_id, item_id)` first. Remove uses:

```ts
where(and(eq(profiles_items_favorites.profile_id, user.profile_id), eq(profiles_items_favorites.item_id, item_id)));
```

Require the item to be published, available, not deleted, and owned by a different profile before adding it.

- [ ] **Step 3: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/routes/favorites.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/routes/favorites/index.ts apps/server/test/routes/favorites.test.ts
git commit -m "test(server): isolate favorite mutations"
```

## Task 6: Verify chat with ordinary text before proposals

**Files:**

- Create: `apps/server/test/routes/chat.test.ts`
- Modify: `apps/server/src/routes/chat/index.ts`

- [ ] **Step 1: Write all five chat-route tests**

The principal case must run in this order:

1. buyer creates room for seller's item;
2. duplicate create returns the same room;
3. buyer posts `Ciao, l'articolo è ancora disponibile?`;
4. seller posts `Sì, è disponibile e posso spedirlo domani.`;
5. both room lists show the correct last message;
6. buyer reads messages in chronological order;
7. seller's unread message receives `read_at` while buyer's own message is not rewritten;
8. buyer resolves the room through `/rooms/id/:item_id`.

Also cover owner creating a room (400), missing item (404), outsider list isolation, outsider read/write (403), absent/malformed room/item IDs, and empty/over-600-character message (400). Assert the first text message creates a Mailpit notification for the seller.

- [ ] **Step 2: Fix ID-domain and notification conditions**

Unread filtering must compare `chat_messages.sender_id` with `user.profile_id`, never `user.id`. Validate numeric `roomId` before querying. Room creation must require a published, available, non-deleted item. Keep seller and buyer participant checks on every message query/mutation.

- [ ] **Step 3: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/routes/chat.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/routes/chat/index.ts apps/server/test/routes/chat.test.ts
git commit -m "test(server): verify two-party text chat"
```

## Task 7: Verify proposals, orders, platform costs, and immediate purchase

**Files:**

- Create route test files listed in the file map.
- Modify: `apps/server/src/routes/orders-proposals/index.ts`
- Modify: `apps/server/src/routes/orders/index.ts`
- Modify: `apps/server/src/routes/item/index.ts`

- [ ] **Step 1: Cover all proposal routes and transitions**

For `create`, seller update, buyer abort, get by ID, and get by item:

- reject unauthenticated, malformed, absent, unavailable, own-item, wrong-owner, duplicate-pending, and active-order cases;
- create persists `pending`, shipping/platform/payment costs, parent Shippo shipment ID, a `proposal` chat message, and seller email;
- only the item seller may accept/reject;
- reject writes system chat and email without order/transaction;
- accept creates exactly one Trustap transaction row and one payment-pending order, then writes an accepted system message;
- buyer abort is limited to the proposal owner while pending;
- read routes expose a proposal only to its buyer or the item's seller;
- `by_item` applies optional status and participant predicates rather than joining every profile.

- [ ] **Step 2: Cover order authorization and profile-ID filtering**

`GET /orders/auth/status/:status` accepts `all` or a value in `ORDER_PHASES`, uses `user.profile_id`, and returns only orders where the user is buyer or seller. `GET /orders/auth/:id` validates a numeric ID and returns 404 unless the authenticated profile is buyer or seller. Test buyer, seller, outsider, absent ID, malformed ID, known status, invalid status, and empty list.

- [ ] **Step 3: Cover platform costs and buy-now**

Platform-cost tests assert invalid prices are 400 and successful integer-cent inputs match `calculatePlatformFee`, Trustap stub charge, and configured proposal expiry. Buy-now tests assert:

- buyer and seller active addresses and provider IDs are used;
- Shippo shipment preview, Trustap fee, and Trustap transaction are called with integer cents;
- order, provider transaction, payment URL, and buyer email are created atomically;
- own item, unavailable item, missing buyer provider/address, duplicate blocked state, and provider failure do not leave partial DB rows.

- [ ] **Step 4: Correct order and proposal ownership**

Use profile IDs for `orders.buyer_id`/`seller_id`. Every proposal/order read includes:

```ts
or(eq(resourceBuyerProfileId, user.profile_id), eq(resourceSellerProfileId, user.profile_id));
```

For non-participants return 404. Do not reveal whether another user's proposal/order exists. Move outbound emails after the DB transaction commits; a mail failure must not roll back a successfully persisted order, and an order failure must not emit a success email.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/routes/proposals.test.ts test/routes/orders.test.ts test/routes/platform-costs.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/routes/orders-proposals/index.ts apps/server/src/routes/orders/index.ts apps/server/src/routes/item/index.ts apps/server/test/routes/proposals.test.ts apps/server/test/routes/orders.test.ts apps/server/test/routes/platform-costs.test.ts
git commit -m "test(server): verify proposal and order contracts"
```

## Task 8: Prove both C2C commerce workflows

**Files:**

- Create workflow files from the file map.

- [ ] **Step 1: Write listing/favorite/chat/proposal workflow**

Use only public API calls for business mutations:

1. seller creates item;
2. seller uploads an image;
3. anonymous detail returns it;
4. buyer adds/checks/lists the favorite;
5. buyer creates a room and sends ordinary text;
6. seller replies with ordinary text;
7. buyer calculates shipment cost and retains legacy `shipment_label_id === 'shipment-test'`;
8. buyer creates a proposal in the existing room;
9. seller reads text then proposal and accepts it;
10. buyer and seller can read the new order; outsider cannot;
11. verify exact DB relations and captured provider requests.

- [ ] **Step 2: Write independent buy-now workflow**

Use a fresh item and buyer. Calculate platform/shipping costs, call buy-now, assert payment-pending order and payment URL, then prove a repeated buy-now is rejected and creates no second transaction/order.

- [ ] **Step 3: Run shuffled, full gate, and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/workflows/listing-favorite-chat-proposal.test.ts test/workflows/buy-now-order.test.ts --config vitest.config.ts --sequence.shuffle --sequence.seed=131
pnpm --filter @workspace/server test:api
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
pnpm --filter @workspace/server build
git add apps/server/test/workflows/listing-favorite-chat-proposal.test.ts apps/server/test/workflows/buy-now-order.test.ts
git commit -m "test(server): prove C2C commerce workflows"
```

## Commerce completion criteria

- All 25 commerce method/path pairs (9 item/listing, 1 upload, 2 favorite, 5 chat, 5 proposal, 2 order, and 1 platform-cost; buy-now is counted within item/listing) have explicit positive and relevant negative coverage.
- Seller, buyer, and outsider authorization is deterministic even when user IDs differ from profile IDs.
- Item edit has a defined, owner-only transactional contract instead of returning an empty object.
- Upload writes exactly four variants per image to the worker's MinIO bucket and rolls back partial objects.
- Favorite removal cannot affect another profile.
- Two normal text messages precede the proposal in the required workflow.
- Proposal acceptance and buy-now each create one coherent order/Trustap graph and reject duplicates.
- No live Trustap, Shippo, AWS, or SMTP account is contacted.
- Tests, lint, typecheck, and build pass with zero warnings.
