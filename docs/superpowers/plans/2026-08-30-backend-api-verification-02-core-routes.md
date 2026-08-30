# Backend Core Route Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and correct the authentication, password, catalog, profile, and address APIs against isolated PostgreSQL and captured Mailpit email.

**Architecture:** Route suites call the exported Hono app with `app.request()` and authenticate through the real signup/login endpoints. Fixtures create only prerequisite catalog/location rows; every mutation is asserted through Drizzle. The legacy password-reset URLs retain `/auth` for compatibility but receive a narrow cookie-middleware exception because a logged-out user must be able to complete the reset lifecycle.

**Tech Stack:** Hono, Vitest, Drizzle ORM, PostgreSQL Testcontainers, Mailpit, Zod, Hono JWT/cookies.

---

**Depends on:** `2026-08-30-backend-api-verification-01-foundation.md`

**Approved design:** `docs/superpowers/specs/2026-08-30-backend-api-verification-design.md`

## File map

### Files created

- `apps/server/test/helpers/auth.ts` — login through the application and return an independent cookie jar.
- `apps/server/test/fixtures/catalog.ts` — deterministic country, state, city, category, subcategory, property, and value graph.
- `apps/server/test/fixtures/catalog.test.ts` — relation-backed fixture proof.
- `apps/server/test/fixtures/addresses.ts` — valid address payloads and persisted address fixtures.
- `apps/server/test/routes/authentication.test.ts` — signup, login, verify, refresh, logout, and current-user contracts.
- `apps/server/test/routes/password.test.ts` — complete forgot/verify/reset lifecycle from Mailpit content.
- `apps/server/test/workflows/authentication-lifecycle.test.ts` — one uninterrupted user lifecycle.
- `apps/server/test/routes/catalog.test.ts` — all ten catalog/location routes.
- `apps/server/test/routes/profiles.test.ts` — all four profile routes.
- `apps/server/test/routes/addresses.test.ts` — all five address routes and ownership invariants.

### Files modified

- `apps/server/src/routes/signup/index.ts` — atomic account/profile creation and captured test email.
- `apps/server/src/routes/login/index.ts` — correct credential and verification status codes.
- `apps/server/src/routes/verify/index.ts` — invalid-token handling and verified claims.
- `apps/server/src/routes/refresh/index.ts` — atomic one-time refresh-token rotation.
- `apps/server/src/routes/password/forgot-password.ts` — validation, Mailpit delivery in tests, and prior-token invalidation.
- `apps/server/src/routes/password/verify-reset-password-token.ts` — public route backed by the stored unexpired token.
- `apps/server/src/routes/password/reset-password.ts` — public, one-time, unexpired reset.
- `apps/server/src/routes/password/reset-token.service.ts` — shared stored-token expiry/ownership check.
- `apps/server/src/lib/create-app.ts` — exact public exception for the two legacy password-reset paths.
- `apps/server/src/routes/profile/index.ts` — distinguish absent active location from malformed data.
- Catalog controllers/services under `apps/server/src/routes/{categories,subcategories,properties,subcategory-properties,locations}` — use 400 for malformed identifiers and 404 for absent resources.
- `apps/server/test/contracts/route-registry.ts` — record the two public password paths.

## Contract conventions for this checkpoint

Use this status vocabulary in the new tests and only change route responses where the current behavior is demonstrably incorrect:

| Condition                                  | Status |
| ------------------------------------------ | -----: |
| malformed JSON, query, or path identifier  |    400 |
| absent/invalid credentials                 |    401 |
| authenticated but email not verified       |    403 |
| authenticated user does not own a resource |    404 |
| valid identifier with no resource          |    404 |
| duplicate username                         |    422 |
| duplicate email                            |    409 |
| unexpected database/provider failure       |    500 |

Keep existing success response property names so the typed storefront client is not changed by this checkpoint.

## Task 1: Add real-session authentication helpers

**Files:**

- Create: `apps/server/test/helpers/auth.ts`
- Modify: `apps/server/test/fixtures/factories.ts`
- Modify: `apps/server/test/helpers/helpers.test.ts`

- [ ] **Step 1: Write a failing helper test**

Add a test that creates a verified user fixture, calls `loginAs()`, then calls `GET /user/auth` with the returned jar and expects that fixture's `id`, `profile_id`, `username`, and email.

- [ ] **Step 2: Implement the helper through the public route**

Create `apps/server/test/helpers/auth.ts`:

```ts
import { app } from '../../src/app';
import type { createUserFixture } from '../fixtures/factories';
import { captureCookies, CookieJar, jsonRequest } from './request';

type UserFixture = Awaited<ReturnType<typeof createUserFixture>>;

export async function loginAs(fixture: UserFixture): Promise<CookieJar> {
	const jar = new CookieJar();
	const response = await app.request(
		'/login',
		jsonRequest('POST', {
			email: fixture.user.email,
			password: fixture.password,
		}),
	);
	if (response.status !== 200) throw new Error(`Fixture login failed with ${response.status}`);
	captureCookies(response, jar);
	return jar;
}

export async function authenticatedRequest(
	path: string,
	method: string,
	jar: CookieJar,
	body?: unknown,
): Promise<Response> {
	const response = await app.request(path, jsonRequest(method, body, jar));
	captureCookies(response, jar);
	return response;
}
```

Extend `createUserFixture()` with an `emailVerified` option instead of overriding the password hash by accident:

```ts
export async function createUserFixture(
	options: {
		user?: Partial<typeof users.$inferInsert>;
		profile?: Partial<typeof profiles.$inferInsert>;
		password?: string;
		emailVerified?: boolean;
	} = {},
);
```

Hash `options.password ?? 'StrongPass123!'`, spread user/profile overrides before protected foreign keys, and return the plaintext password only to the test.

- [ ] **Step 3: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/helpers/helpers.test.ts --config vitest.config.ts
pnpm --filter @workspace/server typecheck
git add apps/server/test/helpers/auth.ts apps/server/test/helpers/helpers.test.ts apps/server/test/fixtures/factories.ts
git commit -m "test(server): authenticate API fixtures through login"
```

## Task 2: Verify signup, email verification, login, refresh, logout, and user identity

**Files:**

- Create: `apps/server/test/routes/authentication.test.ts`
- Modify: `apps/server/src/routes/signup/index.ts`
- Modify: `apps/server/src/routes/login/index.ts`
- Modify: `apps/server/src/routes/verify/index.ts`
- Modify: `apps/server/src/routes/refresh/index.ts`
- Modify: `apps/server/src/routes/logout/index.ts`

- [ ] **Step 1: Write the route matrix before changing handlers**

Implement these named cases in `authentication.test.ts`:

| Route                | Case                              | HTTP and persistence assertion                                                                                                   |
| -------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `POST /signup`       | valid body                        | 201; one user and one profile; password differs from plaintext; activation cookie; Mailpit link contains the stored user's token |
| `POST /signup`       | invalid email/privacy/password    | 400; no user/profile rows                                                                                                        |
| `POST /signup`       | existing username                 | 422; no second account                                                                                                           |
| `POST /signup`       | existing email                    | 409; no second account                                                                                                           |
| `GET /verify`        | absent/malformed access token     | 401 in both cases                                                                                                                |
| `GET /verify/email`  | absent/malformed/wrong-type token | 400; user remains unverified                                                                                                     |
| `GET /verify/email`  | activation token from email       | 200; user becomes verified; both cookies set; decoded access claim has `email_verified: true`; one refresh row                   |
| `GET /verify/email`  | already verified user             | 200; no second refresh row                                                                                                       |
| `POST /login`        | verified valid credentials        | 200; access/refresh cookies; one matching stored refresh token                                                                   |
| `POST /login`        | unknown email and wrong password  | identical 401 body                                                                                                               |
| `POST /login`        | valid unverified account          | 403 and no cookies                                                                                                               |
| `GET /user/auth`     | valid session                     | 200 with the database identity                                                                                                   |
| `GET /user/auth`     | no session                        | 401                                                                                                                              |
| `POST /refresh/auth` | valid session                     | 200; cookie tokens change; old DB token is deleted; exactly one new token remains                                                |
| `POST /refresh/auth` | replay old refresh token          | 401 and all session rows for that token are invalidated                                                                          |
| `POST /logout/auth`  | valid session                     | 200; both cookies expire; matching refresh row removed                                                                           |
| `POST /logout/auth`  | reused logged-out jar             | 401                                                                                                                              |

Use this body builder in the test rather than duplicating literals:

```ts
function signupBody(suffix: string) {
	return {
		username: `signup-${suffix}`,
		email: `signup-${suffix}@tantovale.test`,
		password: 'StrongPass123!',
		name: 'Mario',
		surname: 'Rossi',
		gender: 'male' as const,
		privacy_policy: true as const,
		marketing_policy: false,
	};
}
```

- [ ] **Step 2: Observe the documented failures**

```bash
pnpm --filter @workspace/server exec vitest run test/routes/authentication.test.ts --config vitest.config.ts
```

Expected current failures: test-mode signup emits no email; invalid credentials return 500; email verification signs stale `email_verified: false`; invalid activation JWT escapes the handler; refresh inserts without consuming the old row.

- [ ] **Step 3: Make signup atomic and deliver email outside development**

In `signup/index.ts`, keep duplicate checks outside the transaction, then insert `users` and `profiles` within one `db.transaction()`. Return the created user only after both inserts succeed. Use:

```ts
const { isDevelopmentMode } = getNodeEnvMode(NODE_ENV);
if (isDevelopmentMode) console.log('\nverificationLink: ', verificationLink, '\n');
else await sendVerifyEmail(email, verificationLink);
```

This sends to Mailpit in `NODE_ENV=test` while preserving development logging and production/staging delivery.

- [ ] **Step 4: Correct authentication semantics**

- Return the same `{ message: 'invalid email or password' }`, status 401 for unknown email and wrong password.
- Return 403 for a known unverified account.
- In email verification, wrap JWT verification and all DB work in `try/catch`, require `type === 'email_verification'`, set both newly signed payloads to `email_verified: true`, and do not create another refresh row on an idempotent second verification.
- In refresh, select by the exact presented token, reject expired rows, and rotate inside one transaction: delete the presented row, insert the new row, then set response cookies.
- In logout, delete the exact presented token rather than every session owned by the username.

- [ ] **Step 5: Run the authentication gate and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/routes/authentication.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/routes/signup/index.ts apps/server/src/routes/login/index.ts apps/server/src/routes/verify/index.ts apps/server/src/routes/refresh/index.ts apps/server/src/routes/logout/index.ts apps/server/test/routes/authentication.test.ts
git commit -m "test(server): verify authentication route contracts"
```

## Task 3: Make the logged-out password lifecycle executable

**Files:**

- Create: `apps/server/test/routes/password.test.ts`
- Create: `apps/server/src/routes/password/reset-token.service.ts`
- Modify: `apps/server/src/routes/password/forgot-password.ts`
- Modify: `apps/server/src/routes/password/verify-reset-password-token.ts`
- Modify: `apps/server/src/routes/password/reset-password.ts`
- Modify: `apps/server/src/lib/create-app.ts`
- Modify: `apps/server/test/contracts/route-registry.ts`

- [ ] **Step 1: Write the password tests**

Cover:

| Case                                                                | Expected result                                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| missing/invalid email body                                          | 400                                                                                |
| unknown and known email                                             | same 200 response; unknown produces no message; known produces one Mailpit message |
| second request for same user                                        | first stored token removed; one current token remains                              |
| `GET /password/auth/reset-verify-token` with stored unexpired token | 200 `{ valid: true, id }` without auth cookies                                     |
| verify route with malformed, absent, deleted, or expired token      | 400                                                                                |
| `POST /password/auth/reset` with missing/weak password              | 400 and no mutation                                                                |
| successful reset                                                    | 200; password hash changes; token row deleted                                      |
| token reuse                                                         | 400                                                                                |
| login after reset                                                   | old password 401; new password 200                                                 |

The test must extract the token from Mailpit output, not read it directly from the database for the success path.

- [ ] **Step 2: Observe the current auth-path failure**

```bash
pnpm --filter @workspace/server exec vitest run test/routes/password.test.ts --config vitest.config.ts
```

Expected: the verify/reset calls fail with 401 because both paths contain `/auth`; test-mode forgot-password sends no email; expiry is not checked.

- [ ] **Step 3: Make the legacy reset routes public without renaming them**

Mount the handlers at:

```ts
.get('/auth/reset-verify-token', ...)
.post('/auth/reset', zValidator('json', z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(100),
})), ...)
```

Remove explicit `authMiddleware` from both. In `createApp()`, exempt exactly `/password/auth/reset-verify-token` and `/password/auth/reset` from the global cookie-auth dispatch; do not broaden the exception to other paths containing `/auth`. Create one shared lookup in `apps/server/src/routes/password/reset-token.service.ts`:

```ts
export async function findValidResetToken(token: string) {
	const { db } = createClient();
	const stored = await db.query.password_reset_tokens.findFirst({ where: { token } });
	if (!stored || stored.expires_at.getTime() <= Date.now()) return undefined;
	return stored;
}
```

JWT verification is necessary but not sufficient: both handlers must also require this DB row and matching `payload.id`. Reset deletes the row in the same transaction that updates the password. Forgot-password deletes prior tokens for the user before inserting the replacement and sends through Mailpit whenever `NODE_ENV !== 'development'`.

- [ ] **Step 4: Update the executable route registry**

Change only the auth classification of these existing entries:

```ts
{ method: 'GET', path: '/password/auth/reset-verify-token', auth: 'public', suite: 'authentication' },
{ method: 'POST', path: '/password/auth/reset', auth: 'public', suite: 'authentication' },
```

Route count remains 63.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/routes/password.test.ts test/contracts/route-parity.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/lib/create-app.ts apps/server/src/routes/password apps/server/test/routes/password.test.ts apps/server/test/contracts/route-registry.ts
git commit -m "fix(server): make password reset usable when logged out"
```

## Task 4: Seed the exact catalog/location graph used by API tests

**Files:**

- Create: `apps/server/test/fixtures/catalog.ts`
- Create: `apps/server/test/fixtures/catalog.test.ts`
- Create: `apps/server/test/fixtures/addresses.ts`
- Modify: `apps/server/test/fixtures/factories.ts`

- [ ] **Step 1: Add a failing relation-fixture test**

Create a focused fixture test that inserts the graph below and reads it back through `db.query.subcategories.findFirst({ with: ... })`. Assert category, parent subcategory, property mapping, property values, state, and city IDs.

- [ ] **Step 2: Implement a deterministic graph**

`createCatalogFixture()` must insert, in foreign-key order:

1. country id `107`, code `IT`;
2. state id `77`, code `MI`;
3. city id `77001`, name `Milano`;
4. one published and one unpublished category;
5. a published parent and child subcategory plus one unpublished subcategory;
6. text, numeric, and boolean properties;
7. one `subcategory_properties` row per property;
8. property values including numeric `0` and boolean `false` to protect against truthiness bugs.

`validAddressBody()` must return all fields accepted by `addAddressSchema`, using the fixture state/city IDs and status `inactive`. `createAddressFixture(profileId, overrides)` persists it with the requested owner.

- [ ] **Step 3: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/fixtures/catalog.test.ts --config vitest.config.ts
pnpm --filter @workspace/server typecheck
git add apps/server/test/fixtures/catalog.ts apps/server/test/fixtures/addresses.ts apps/server/test/fixtures/catalog.test.ts apps/server/test/fixtures/factories.ts
git commit -m "test(server): add catalog and address fixtures"
```

## Task 5: Cover all catalog and location routes

**Files:**

- Create: `apps/server/test/routes/catalog.test.ts`
- Modify: catalog controllers/services listed in the file map.

- [ ] **Step 1: Write table-driven tests for all ten route pairs**

The success table must invoke every route exactly once:

```ts
const successCases = [
	['GET', '/categories'],
	['GET', '/subcategories'],
	['GET', ({ childId }) => `/subcategories/${childId}`],
	['GET', ({ parentId }) => `/subcategories/no_parent/${parentId}`],
	['GET', ({ propertyId }) => `/properties/${propertyId}`],
	['GET', ({ childId }) => `/properties/subcategory_properties/${childId}`],
	['GET', ({ mappingId }) => `/subcategory_properties/${mappingId}`],
	['GET', ({ childId }) => `/subcategory_properties/filter/${childId}`],
	['GET', '/locations/search?locationType=city&locationName=Mil&locationCountryCode=IT'],
	['GET', ({ cityId }) => `/locations/search_by_id/city/${cityId}`],
] as const;
```

In addition assert:

- unpublished categories/subcategories are not exposed;
- malformed numeric IDs return 400;
- well-formed absent IDs return 404, never 500;
- missing location type/name returns 400;
- an invalid location type returns 400;
- no location matches returns `200 []` for search;
- numeric zero and boolean false property options remain `0` and `false`;
- `search_by_id` returns 404 when no city exists and 400 for a malformed ID.

- [ ] **Step 2: Correct only semantic status and truthiness defects**

Change missing-resource branches currently returning 500 to 404. In `properties.service.ts`, choose property option values by null checks:

```ts
const value =
	row.fv_boolean_value !== null
		? row.fv_boolean_value
		: row.fv_number_value !== null
			? row.fv_number_value
			: row.fv_value;
```

Do not rename legacy response keys in this checkpoint.

- [ ] **Step 3: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/routes/catalog.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/routes/categories apps/server/src/routes/subcategories apps/server/src/routes/properties apps/server/src/routes/subcategory-properties apps/server/src/routes/locations apps/server/test/routes/catalog.test.ts
git commit -m "test(server): verify catalog and location APIs"
```

## Task 6: Cover profiles and address ownership/state transitions

**Files:**

- Create: `apps/server/test/routes/profiles.test.ts`
- Create: `apps/server/test/routes/addresses.test.ts`
- Modify: `apps/server/src/routes/profile/index.ts`
- Modify: `apps/server/src/routes/addresses/index.ts`

- [ ] **Step 1: Write all four profile-route contracts**

Cover `GET /profile/auth`, `GET /profile/auth/profile_active_address_id`, `GET /profile/compact/:username`, and `PUT /profile/auth` with:

- 401 without cookies for protected operations;
- 404 from full profile GET until an active address exists;
- `200 null` from active-address-id until one exists;
- correct joined city/province after address creation;
- compact profile count including only published items;
- 404 for an unknown username;
- successful own-profile update and 400 invalid body.

Fix the compact route's empty city query by checking `cityData` itself, not the always-truthy containing array.

- [ ] **Step 2: Write all five address-route contracts**

Cover the two GET, one POST, and two PUT routes with two independently authenticated users. Assert:

- first address is forced active even when the submitted status is inactive;
- adding a second active address demotes the previous active address atomically;
- list returns active/inactive but not deleted addresses in stable ID order;
- default returns the unique active address;
- updating another user's ID returns 404 and changes no row;
- an active address cannot be demoted directly or hidden;
- switching the second address active demotes the first;
- hiding an inactive own address marks it deleted;
- repeated hide and unknown ID return 404;
- missing/invalid payloads return 400.

- [ ] **Step 3: Make absent update targets explicit**

In the update transaction, return 404 when `currentAddress` is absent before modifying any active row. Keep the owner predicate on both the read and update. Preserve the existing single-active-address transaction.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/routes/profiles.test.ts test/routes/addresses.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
git add apps/server/src/routes/profile/index.ts apps/server/src/routes/addresses/index.ts apps/server/test/routes/profiles.test.ts apps/server/test/routes/addresses.test.ts
git commit -m "test(server): verify profile and address APIs"
```

## Task 7: Prove the complete authentication lifecycle

**Files:**

- Create: `apps/server/test/workflows/authentication-lifecycle.test.ts`

- [ ] **Step 1: Write one uninterrupted workflow**

The test must execute, in order:

1. signup;
2. read the verification email from Mailpit;
3. verify email using its link;
4. verify the access cookie;
5. read `/user/auth`;
6. rotate tokens;
7. log out and prove `/user/auth` is 401;
8. request password reset;
9. read the reset email from Mailpit;
10. verify and consume the reset token;
11. reject old login and accept new login;
12. log out again.

Do not query either token from PostgreSQL on the success path. DB assertions may only verify row count, expiry, and consumption.

- [ ] **Step 2: Run with shuffled order and commit**

```bash
pnpm --filter @workspace/server exec vitest run test/workflows/authentication-lifecycle.test.ts test/routes/authentication.test.ts test/routes/password.test.ts --config vitest.config.ts --sequence.shuffle --sequence.seed=73
pnpm --filter @workspace/server test:api
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
pnpm --filter @workspace/server build
git add apps/server/test/workflows/authentication-lifecycle.test.ts
git commit -m "test(server): prove authentication lifecycle"
```

## Core-route completion criteria

- Authentication helpers obtain real application cookies and never fabricate happy-path JWTs.
- Signup/profile creation is atomic and its email is observable in Mailpit.
- Verification claims match the updated database state.
- Refresh tokens are one-time and atomically rotated.
- Password reset works with no authenticated session, requires an unexpired stored token, and cannot be replayed.
- All ten catalog/location, four profile, and five address method/path pairs have positive and relevant negative coverage.
- Two users cannot read or mutate one another's private address resources.
- Route registry parity remains exactly 63.
- Tests, lint, typecheck, and build pass with zero warnings.
