# Post-migration Playwright smoke test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the migrated local application supports image-backed listing creation, favorite, chat, profile, settings, and logout flows through two isolated user sessions.

**Architecture:** Add an opt-in S3-compatible endpoint boundary. Production keeps the existing AWS endpoint and URL behavior when local variables are absent; local development can direct the S3 client and public object URLs to a temporary MinIO service. Keep Playwright and MinIO harness files in `/private/tmp`; only the minimal reusable endpoint configuration belongs in the repository.

**Tech Stack:** Node 22, pnpm, Next.js 16, Hono, AWS SDK v3, MinIO, Docker, `@playwright/test`, Chromium, PostgreSQL seed data.

---

## File structure

- Modify: `apps/server/src/env.ts` — validate optional server-side MinIO endpoint and public-object URL.
- Modify: `apps/server/src/lib/s3client.ts` — configure path-style endpoint conditionally and centralize public object URL construction.
- Modify: `apps/server/src/routes/uploads/index.ts` — persist URLs created by the shared URL helper.
- Modify: `apps/server/env.example` — document empty optional local S3 variables.
- Modify: `apps/storefront/next.config.js` — admit one explicit local public-object origin when configured, while keeping the existing HTTPS production rule.
- Modify: `apps/storefront/env.example` — document the optional storefront public-object origin.
- Create: `/private/tmp/tantovale-playwright-smoke/minio.env` — local-only generated MinIO credentials and S3 variables.
- Create: `/private/tmp/tantovale-playwright-smoke/package.json` — isolated non-repository Playwright manifest.
- Create: `/private/tmp/tantovale-playwright-smoke/playwright.config.ts` — local Chromium runner configuration.
- Create: `/private/tmp/tantovale-playwright-smoke/fixtures/listing.png` — a tiny valid image fixture used for the real upload path.
- Create: `/private/tmp/tantovale-playwright-smoke/tests/post-migration-smoke.spec.ts` — one serial C2C smoke scenario using two contexts.
- Create: `/private/tmp/tantovale-playwright-smoke/SMOKE-RESULT.md` — generated result record without secrets.

### Task 1: Add the opt-in local S3 configuration boundary

**Files:**

- Modify: `apps/server/src/env.ts`
- Modify: `apps/server/src/lib/s3client.ts`
- Modify: `apps/server/src/routes/uploads/index.ts`
- Modify: `apps/server/env.example`

- [ ] **Step 1: Add optional endpoint and public URL variables to server validation and documentation**

In the AWS block of `apps/server/src/env.ts`, add these two fields after `AWS_SECRET_ACCESS_KEY`:

```ts
AWS_S3_ENDPOINT_URL: z.string().url().optional(),
AWS_S3_PUBLIC_URL: z.string().url().optional(),
```

In the AWS block of `apps/server/env.example`, add empty documented values:

```dotenv
AWS_S3_ENDPOINT_URL=
AWS_S3_PUBLIC_URL=
```

Expected: the server accepts both variables when supplied and preserves its current behavior when they are absent.

- [ ] **Step 2: Make the S3 client endpoint conditional and remove the hard-coded bucket name**

Replace `apps/server/src/lib/s3client.ts` with this implementation:

```ts
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { environment } from '#utils/constants';

const endpoint = environment.AWS_S3_ENDPOINT_URL;
const bucketName = environment.AWS_BUCKET_NAME;

export const s3Client = new S3Client({
	region: environment.AWS_REGION,
	credentials: {
		accessKeyId: environment.AWS_ACCESS_KEY,
		secretAccessKey: environment.AWS_SECRET_ACCESS_KEY,
	},
	...(endpoint ? { endpoint, forcePathStyle: true } : {}),
});

export function getPublicObjectUrl(key: string) {
	const publicUrl = environment.AWS_S3_PUBLIC_URL?.replace(/\/$/, '');

	return publicUrl ? `${publicUrl}/${bucketName}/${key}` : `https://${bucketName}.s3.amazonaws.com/${key}`;
}

export async function getObjectUrl(key: string) {
	return getSignedUrl(
		s3Client,
		new GetObjectCommand({
			Bucket: bucketName,
			Key: key,
		}),
	);
}
```

Expected: `forcePathStyle` and an alternate endpoint exist only when `AWS_S3_ENDPOINT_URL` is set; no production endpoint or bucket is hard-coded.

- [ ] **Step 3: Use the centralized public URL helper in the upload route**

In `apps/server/src/routes/uploads/index.ts`, change the S3 import to:

```ts
import { getPublicObjectUrl, s3Client } from '../../lib/s3client';
```

Replace each of the four persisted `url` template literals with the corresponding helper call:

```ts
url: getPublicObjectUrl(file.originalKey),
url: getPublicObjectUrl(file.mediumKey),
url: getPublicObjectUrl(file.smallKey),
url: getPublicObjectUrl(file.thumbKey),
```

Expected: all image variants share one environment-aware URL construction rule.

- [ ] **Step 4: Type-check and lint the changed backend**

Run from `/Users/rown/Desktop/tantovale`:

```bash
pnpm --filter @workspace/server typecheck
pnpm --filter @workspace/server lint
```

Expected: both commands exit `0` with no new warnings.

- [ ] **Step 5: Commit the backend configuration boundary**

Run:

```bash
git add apps/server/src/env.ts apps/server/src/lib/s3client.ts apps/server/src/routes/uploads/index.ts apps/server/env.example
git commit -m "feat(server): support local S3-compatible endpoints"
```

Expected: the commit contains only the four files listed above.

### Task 2: Permit one configured local image origin in the storefront

**Files:**

- Modify: `apps/storefront/next.config.js`
- Modify: `apps/storefront/env.example`

- [ ] **Step 1: Add the documented optional storefront origin**

Append this line to `apps/storefront/env.example`:

```dotenv
NEXT_PUBLIC_S3_PUBLIC_URL=
```

Expected: local developers can discover the exact origin variable without putting credentials in the storefront environment.

- [ ] **Step 2: Derive a precise remote image pattern from that origin**

Replace `apps/storefront/next.config.js` with:

```js
/** @type {import('next').NextConfig} */
const localS3PublicUrl = process.env.NEXT_PUBLIC_S3_PUBLIC_URL;
const localS3Origin = localS3PublicUrl ? new URL(localS3PublicUrl) : undefined;

const nextConfig = {
	reactStrictMode: true,
	output: 'standalone',
	transpilePackages: ['@workspace/ui', '@workspace/server'],
	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: '*',
			},
			...(localS3Origin
				? [
						{
							protocol: localS3Origin.protocol.slice(0, -1),
							hostname: localS3Origin.hostname,
							port: localS3Origin.port,
							pathname: '/**',
						},
					]
				: []),
		],
	},
};

export default nextConfig;
```

Expected: no HTTP image source is allowed unless the developer explicitly configures one; production retains its existing HTTPS wildcard behavior.

- [ ] **Step 3: Validate the storefront configuration**

Run from `/Users/rown/Desktop/tantovale`:

```bash
pnpm --filter @workspace/storefront typecheck
pnpm --filter @workspace/storefront lint
pnpm --filter @workspace/storefront exec next build --webpack
```

Expected: typecheck and lint pass; the webpack build is the established production-build diagnostic while the known Turbopack CSS panic remains outside this task.

- [ ] **Step 4: Commit the storefront configuration boundary**

Run:

```bash
git add apps/storefront/next.config.js apps/storefront/env.example
git commit -m "feat(storefront): allow configured local image origins"
```

Expected: the commit contains only the two storefront files.

### Task 3: Start and verify temporary MinIO

**Files:**

- Create: `/private/tmp/tantovale-playwright-smoke/minio.env`
- Modify: none in the repository

- [ ] **Step 1: Create the private temporary workspace and generate local-only credentials**

Run:

```bash
mkdir -p /private/tmp/tantovale-playwright-smoke/fixtures /private/tmp/tantovale-playwright-smoke/tests
umask 077
```

Create `minio.env` with five generated values: `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `AWS_ACCESS_KEY`, `AWS_SECRET_ACCESS_KEY`, and `AWS_BUCKET_NAME=tantovale-playwright-smoke`. Set `AWS_S3_ENDPOINT_URL=http://127.0.0.1:9000` and `AWS_S3_PUBLIC_URL=http://127.0.0.1:9000`. Do not print this file or commit it.

Expected: the file is readable only by the current user and stays outside the repository.

- [ ] **Step 2: Run the disposable MinIO container and create a public-read test bucket**

Run the named MinIO container on port `9000`, pass only `minio.env` values as environment variables, and mount no persistent volume. Use a temporary `minio/mc` container on the same Docker network to create the value of `AWS_BUCKET_NAME` and set its anonymous policy to `download`.

Expected: `curl --fail http://127.0.0.1:9000/minio/health/live` exits `0`, and unauthenticated GET access to objects in the test bucket is enabled while listing remains unavailable.

- [ ] **Step 3: Restart local development services with only the local S3 endpoint variables**

Start the Hono server with `AWS_S3_ENDPOINT_URL`, `AWS_S3_PUBLIC_URL`, `AWS_ACCESS_KEY`, `AWS_SECRET_ACCESS_KEY`, and `AWS_BUCKET_NAME` loaded from the temporary file. Start the storefront with `NEXT_PUBLIC_S3_PUBLIC_URL=http://127.0.0.1:9000`. Keep all payment, shipping, SMTP, webhook, and AWS production credentials untouched.

Expected: `/` returns HTTP 200 from the storefront, `/` returns HTTP 200 from the Hono server, and no request reaches AWS during upload validation.

### Task 4: Build the temporary two-session Playwright harness

**Files:**

- Create: `/private/tmp/tantovale-playwright-smoke/package.json`
- Create: `/private/tmp/tantovale-playwright-smoke/playwright.config.ts`
- Create: `/private/tmp/tantovale-playwright-smoke/fixtures/listing.png`
- Create: `/private/tmp/tantovale-playwright-smoke/tests/post-migration-smoke.spec.ts`

- [ ] **Step 1: Install Playwright outside the repository**

Run:

```bash
cd /private/tmp/tantovale-playwright-smoke
pnpm init
pnpm add --save-dev @playwright/test
pnpm exec playwright install chromium
```

Expected: package metadata, lockfile, browser artifacts, and test output are only in the temporary workspace or browser cache. The Tantovale lockfile must not change.

- [ ] **Step 2: Configure Chromium and failure-only diagnostics**

Write `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 10_000 },
	use: {
		baseURL: 'http://localhost:3000',
		...devices['Desktop Chrome'],
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
	},
	reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
});
```

Expected: the runner executes only temporary tests and keeps failures outside the repository.

- [ ] **Step 3: Generate a valid upload fixture and assert image-backed listing creation**

Create a valid small PNG in `fixtures/listing.png`. In the seller context, choose a seeded category, make the `Title` field invalid with a one-character value, assert visible form feedback, then fill a compliant title, a price, a description of at least 50 characters, required category properties, required delivery controls, and attach `fixtures/listing.png` through the image file input. Submit and assert a public listing URL, exact title, and a loaded image whose request URL begins with `http://127.0.0.1:9000/tantovale-playwright-smoke/`.

Expected: this exercises the native browser upload, Hono upload route, Sharp variants, MinIO writes, image database records, and Next image rendering.

- [ ] **Step 4: Implement isolated authentication and C2C assertions**

Use two fresh `browser.newContext()` calls. Log seller `asdasd` and buyer `fullsull` in separately. Use a timestamp-suffixed listing title and message text. Assert seller selling-items visibility, buyer selling-items isolation, buyer favorite add/reload/favorites-list/remove/reload, buyer message, seller reply, buyer reply receipt, and absence or disabled state of seller self-chat.

Expected: no `storageState` is shared; each assertion operates through accessible locators or generated URLs, never CSS implementation classes.

- [ ] **Step 5: Implement profile and session-revocation assertions with restoration**

On seller Profile, record the original name, save a timestamp-suffixed replacement, assert user-visible success, then restore the original name and assert it. Assert Selling items, Orders loading without a client error, Settings dark theme persisting after reload, logout landing on `/login`, and denied access after navigation to `/auth/profile/info`.

Expected: user-visible profile state is restored even when all scenario assertions pass; restoration failure is reported as a test failure.

### Task 5: Run, report, and verify boundaries

**Files:**

- Create: `/private/tmp/tantovale-playwright-smoke/SMOKE-RESULT.md`
- Test: `/private/tmp/tantovale-playwright-smoke/tests/post-migration-smoke.spec.ts`

- [ ] **Step 1: Execute the temporary smoke test**

Run:

```bash
cd /private/tmp/tantovale-playwright-smoke
pnpm exec playwright test tests/post-migration-smoke.spec.ts
```

Expected: one serial test passes. On failure, retain the trace and screenshot only in the temporary workspace, stop at the failed assertion, and do not alter application behavior as part of diagnosis.

- [ ] **Step 2: Produce the secret-free evidence report**

Write `SMOKE-RESULT.md` with `Passed checks`, `MinIO verification`, `Deliberate exclusions`, and `Failures` sections. Include actual run time, Playwright and Chromium versions, listing title plus URL, image object prefix, and temporary failure artifact paths. The exclusions are signup/email verification, payments, checkout/order creation, shipping, webhooks, and external integrations. Identify MinIO as a local S3-compatible dependency, not an AWS test.

Expected: every in-scope requirement has a concrete pass or failure entry; no report field contains a password, token, cookie, credential, environment value, or full request header.

- [ ] **Step 3: Verify the repository and production-default safety**

Run:

```bash
git -C /Users/rown/Desktop/tantovale status --short
git -C /Users/rown/Desktop/tantovale diff --check
```

Expected: no temporary Playwright, MinIO, test result, trace, screenshot, or credential file appears in the repository. The only tracked changes are the six scoped configuration files; existing Drizzle work and user-owned changes remain untouched.

- [ ] **Step 4: Commit the verified implementation without temporary artifacts**

Run:

```bash
git add apps/server/src/env.ts apps/server/src/lib/s3client.ts apps/server/src/routes/uploads/index.ts apps/server/env.example apps/storefront/next.config.js apps/storefront/env.example
git commit -m "test: validate local C2C smoke flow with MinIO"
```

Expected: no path under `/private/tmp` is staged. If Tasks 1 and 2 were committed separately, omit this duplicate commit and report the two existing commit hashes instead.
