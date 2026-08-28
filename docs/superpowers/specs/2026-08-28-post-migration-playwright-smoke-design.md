# Post-migration Playwright smoke-test design

## Goal

Obtain user-facing evidence that the locally migrated and seeded Tantovale application still supports its core C2C flow: a seller creates a listing, a buyer favorites it and exchanges messages with the seller, and the seller's profile area remains usable.

## Scope

- Run a temporary Playwright smoke test against the existing local storefront at `http://localhost:3000` and its local Hono API.
- Use the seeded, verified accounts `asdasd` as seller and `fullsull` as buyer.
- Use two separate Playwright browser contexts so cookies and authenticated identities are isolated.
- Create one uniquely titled listing without images, using seeded categories and required properties.
- Verify client-visible validation errors by first submitting an incomplete listing form. These errors are intentionally exposed in local debugging and must remain visible.
- Verify the listing in the seller's selling-items area and public detail page.
- Verify buyer favorites add, persistence after refresh, favorites listing, removal, and removal persistence.
- Verify buyer-to-seller chat creation, buyer message, seller reply, and buyer receipt of that reply.
- Verify seller profile editing with a temporary name change followed by restoration, selling items, orders, theme settings persistence, and logout/protected-route behavior.
- Verify light authorization/isolation expectations: a seller cannot start a chat on their own listing and the buyer does not see the seller's listing in the buyer's selling-items area.

## Out of scope

- Signup, email verification, password reset, payment, checkout, orders creation, shipping, webhooks, and external provider integrations.
- Image upload and image rendering: S3 is intentionally disabled in local development. A listing without images is the required local path; an upload failure is not a smoke-test failure.
- Committing Playwright configuration, test files, test dependencies, screenshots, traces, or other artifacts to the repository.
- Any product-code, database-schema, dependency, or configuration change.

## Test architecture

The runner will be a one-off script stored outside the repository. It will receive no secrets through its output and will use the known local seed credentials only to drive the browser. The script will use accessible locators and observable navigation/state rather than database assertions, except for the already completed migration-and-seed precondition.

The seller context logs in as `asdasd`; the buyer context logs in as `fullsull`. The listing title includes a timestamp or equivalent unique suffix. This makes its public URL and selling-items row unambiguous and prevents collisions across repeated executions.

The script will stop at the first functional failure, preserve the failing step, and report a concise summary of passed checks, the listing URL or identifier, exclusions, and reproducible failure details. It must not log passwords, access tokens, refresh tokens, cookies, or environment values.

## Scenario sequence

1. Confirm the local storefront is reachable and each account can authenticate in its own browser context.
2. In the seller context, open the listing form and submit intentionally incomplete data. Assert locally exposed validation/debug error feedback is visible.
3. Complete valid required fields with a seeded category and properties, deliberately omit images, submit, and assert successful creation.
4. Assert the resulting public listing page loads and the listing appears in seller selling items.
5. In the buyer context, open that public listing, add it to favorites, refresh, and assert it remains favorited and appears in Favorites. Remove it, refresh, and assert it remains absent.
6. In the buyer context, start a chat from the listing and send a unique message. In the seller context, open chat, assert receipt, and reply. In the buyer context, assert the reply appears.
7. Assert the seller cannot start a chat with themselves from their own listing, and the buyer's selling-items page does not expose the seller listing.
8. In the seller context, test the profile pages: temporarily update and restore the name, verify Selling items, verify Orders renders a valid empty state, and change the theme then refresh to check persistence.
9. Log the seller out, assert redirection to login, and assert that navigating to an authenticated route no longer grants access.

## Pass/fail criteria

The smoke test passes only when every in-scope assertion succeeds using two isolated authenticated sessions. A visible form validation error is a required pass condition. Failures in routing, authentication, session isolation, persistence, listing creation, favorites, chat, profile interactions, or logout are functional failures and must be reported with the exact failed step.

Expected exclusions must be shown explicitly in the final report: S3/image upload, signup/email verification, payments, checkout/order creation, shipping, and external integrations.

## Cleanup and repeatability

The created listing, chat, and favorite mutations are acceptable local test data because the local database is disposable and the listing title is unique. The profile name change is restored by the script even if the main scenario has passed; if restoration cannot complete, that condition is a reported cleanup failure. Subsequent runs use new unique listing and message values and do not depend on deleting previous test data.
