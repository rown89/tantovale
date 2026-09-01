import { chmod, mkdtemp, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';

import * as exporterModule from '../../scripts/export-openapi';
import { routeContracts } from './route-registry';

type JsonObject = Record<string, unknown>;

const serverDirectory = fileURLToPath(new URL('../..', import.meta.url));
const scriptPath = path.join(serverDirectory, 'scripts', 'export-openapi.ts');
const tsxLoaderPath = createRequire(import.meta.url).resolve('tsx');
const temporaryDirectories: string[] = [];
const documentationEnvironmentKeys = [
	'NODE_ENV',
	'LOG_LEVEL',
	'PROJECT_NAME',
	'NEXT_PUBLIC_HONO_API_URL',
	'SERVER_HOSTNAME',
	'SERVER_PORT',
	'STOREFRONT_HOSTNAME',
	'STOREFRONT_PORT',
	'POSTGRES_USER',
	'POSTGRES_PASSWORD',
	'DATABASE_HOST',
	'DATABASE_PORT',
	'POSTGRES_DB',
	'PAYMENT_PROVIDER_API_URL',
	'PAYMENT_PROVIDER_API_VERSION',
	'PAYMENT_PROVIDER_API_KEY',
	'PAYMENT_PROVIDER_CLIENT_ID',
	'PAYMENT_PROVIDER_CLIENT_SECRET',
	'PAYMENT_PROVIDER_WEBHOOK_USERNAME',
	'PAYMENT_PROVIDER_WEBHOOK_SECRET',
	'PAYMENT_PROVIDER_PAY_PAGE_URL',
	'POST_PAYMENT_REDIRECT_URL',
	'PROVIDER_REQUEST_TIMEOUT_MS',
	'SHIPPING_PROVIDER_API_KEY',
	'SHIPPING_PROVIDER_WEBHOOK_SECRET',
	'SHIPPING_PROVIDER_API_URL',
	'ACCESS_TOKEN_SECRET',
	'REFRESH_TOKEN_SECRET',
	'EMAIL_VERIFY_TOKEN_SECRET',
	'RESET_TOKEN_SECRET',
	'COOKIE_SECRET',
	'AWS_REGION',
	'AWS_ACCESS_KEY',
	'AWS_SECRET_ACCESS_KEY',
	'AWS_BUCKET_NAME',
	'AWS_ENDPOINT',
	'AWS_FORCE_PATH_STYLE',
	'SMTP_HOST',
	'SMTP_PORT',
	'SMTP_USER',
	'SMTP_PASS',
	'SMTP_FROM',
	'SMTP_REQUEST_TIMEOUT_MS',
	'DAILY_ORDER_CHECK_SECRET_KEY',
	'DAILY_ORDER_PROPOSALS_CHECK_SECRET_KEY',
	'TRANSACTIONS_SYNC_SECRET_KEY',
	'PROPOSALS_HANDLING_TOLLERANCE_IN_HOURS',
	'ORDERS_PAYMENT_HANDLING_TOLLERANCE_IN_HOURS',
] as const;

type EnvironmentSnapshot = Array<{
	exists: boolean;
	key: (typeof documentationEnvironmentKeys)[number];
	value?: string;
}>;
type AtomicWriteFile = (
	targetPath: string,
	contents: Uint8Array,
	options?: {
		rename?: (oldPath: string, newPath: string) => Promise<void>;
		syncDirectory?: (directoryPath: string) => Promise<void>;
	},
) => Promise<void>;

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function documentationApp(): { app: { request: () => Promise<Response> } } {
	return {
		app: {
			request: async () =>
				new Response(JSON.stringify({ openapi: '3.1.0', paths: {} }), {
					headers: { 'content-type': 'application/json' },
					status: 200,
				}),
		},
	};
}

function captureDocumentationEnvironment(): EnvironmentSnapshot {
	return documentationEnvironmentKeys.map((key) => ({
		key,
		exists: Object.hasOwn(process.env, key),
		...(process.env[key] === undefined ? {} : { value: process.env[key] }),
	}));
}

function restoreDocumentationEnvironment(snapshot: EnvironmentSnapshot): void {
	for (const entry of snapshot) {
		if (entry.exists) process.env[entry.key] = entry.value;
		else delete process.env[entry.key];
	}
}

function installMixedAmbientEnvironment(): EnvironmentSnapshot {
	documentationEnvironmentKeys.forEach((key, index) => {
		if (index % 2 === 0) process.env[key] = `ambient-${key.toLowerCase()}`;
		else delete process.env[key];
	});
	return captureDocumentationEnvironment();
}

async function temporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(path.join(tmpdir(), 'tantovale-openapi-'));
	temporaryDirectories.push(directory);
	return directory;
}

function runExporter(args: string[], options: { cwd: string; ambientMarker?: string }): SpawnSyncReturns<string> {
	const marker = options.ambientMarker ?? 'ambient-credential-must-not-appear';
	return spawnSync(process.execPath, ['--import', tsxLoaderPath, scriptPath, ...args], {
		cwd: options.cwd,
		encoding: 'utf8',
		timeout: 30_000,
		env: {
			...process.env,
			NODE_NO_WARNINGS: '1',
			NODE_ENV: 'production',
			POSTGRES_PASSWORD: marker,
			ACCESS_TOKEN_SECRET: marker,
			REFRESH_TOKEN_SECRET: marker,
			EMAIL_VERIFY_TOKEN_SECRET: marker,
			RESET_TOKEN_SECRET: marker,
			COOKIE_SECRET: marker,
			PAYMENT_PROVIDER_API_KEY: marker,
			PAYMENT_PROVIDER_CLIENT_SECRET: marker,
			PAYMENT_PROVIDER_WEBHOOK_SECRET: marker,
			SHIPPING_PROVIDER_API_KEY: marker,
			SHIPPING_PROVIDER_WEBHOOK_SECRET: marker,
			AWS_ACCESS_KEY: marker,
			AWS_SECRET_ACCESS_KEY: marker,
			SMTP_PASS: marker,
			DAILY_ORDER_CHECK_SECRET_KEY: marker,
			DAILY_ORDER_PROPOSALS_CHECK_SECRET_KEY: marker,
			TRANSACTIONS_SYNC_SECRET_KEY: marker,
		},
	});
}

function operationEntries(document: JsonObject): Array<[string, JsonObject]> {
	const paths = document.paths as JsonObject;
	return Object.entries(paths).flatMap(([routePath, pathItem]) =>
		Object.entries(pathItem as JsonObject).flatMap(([method, operation]) =>
			['get', 'post', 'put', 'patch', 'delete'].includes(method)
				? [[`${method.toUpperCase()} ${routePath}`, operation as JsonObject] as [string, JsonObject]]
				: [],
		),
	);
}

function expectRecursivelySorted(value: unknown): void {
	if (Array.isArray(value)) {
		for (const entry of value) expectRecursivelySorted(entry);
		return;
	}
	if (typeof value !== 'object' || value === null) return;

	const object = value as JsonObject;
	expect(Object.keys(object)).toEqual(Object.keys(object).sort());
	for (const entry of Object.values(object)) expectRecursivelySorted(entry);
}

function resolveJsonPointer(document: JsonObject, reference: string): unknown {
	if (!reference.startsWith('#/')) return undefined;
	return reference
		.slice(2)
		.split('/')
		.map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
		.reduce<unknown>((value, segment) => {
			if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
			return (value as JsonObject)[segment];
		}, document);
}

function collectReferences(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(collectReferences);
	if (typeof value !== 'object' || value === null) return [];
	return Object.entries(value as JsonObject).flatMap(([key, entry]) => [
		...(key === '$ref' && typeof entry === 'string' ? [entry] : []),
		...collectReferences(entry),
	]);
}

function sensitiveExamples(value: unknown, pathSegments: string[] = []): string[] {
	if (Array.isArray(value)) return value.flatMap((entry) => sensitiveExamples(entry, pathSegments));
	if (typeof value !== 'object' || value === null) return [];

	return Object.entries(value as JsonObject).flatMap(([key, entry]) => {
		const nextPath = [...pathSegments, key];
		const sensitivePath = nextPath.some((segment) =>
			/password|secret|authorization|api.?key|token|cookie/i.test(segment),
		);
		const isExampleValue = /^(example|examples|default)$/i.test(key);
		return [...(sensitivePath && isExampleValue ? [nextPath.join('.')] : []), ...sensitiveExamples(entry, nextPath)];
	});
}

afterAll(async () => {
	await Promise.all(
		temporaryDirectories.map(async (directory) => {
			await rm(directory, { recursive: true, force: true });
		}),
	);
});

describe('canonical OpenAPI export', () => {
	it('sorts object keys recursively without reordering arrays', () => {
		expect(
			exporterModule.sortJsonValue({
				z: [{ z: 1, a: 2 }, 'first'],
				a: { z: true, a: false },
			}),
		).toEqual({
			a: { a: false, z: true },
			z: [{ a: 2, z: 1 }, 'first'],
		});
		expect(Object.keys(exporterModule.sortJsonValue({ z: 1, a: 2 }) as JsonObject)).toEqual(['a', 'z']);
	});

	it('atomically preserves the previous artifact and cleans its temp file when rename fails', async () => {
		const atomicWriteFile = Reflect.get(exporterModule, 'atomicWriteFile') as AtomicWriteFile | undefined;
		expect(atomicWriteFile, 'atomic writer export').toBeTypeOf('function');
		if (!atomicWriteFile) return;

		const directory = await temporaryDirectory();
		const target = path.join(directory, 'tantovale.openapi.json');
		await writeFile(target, 'previous-complete-artifact\n', 'utf8');
		const before = await stat(target);
		const failure = new Error('injected rename failure');

		await expect(
			atomicWriteFile(target, Buffer.from('replacement-complete-artifact\n'), {
				rename: async (temporaryPath, destinationPath) => {
					expect(destinationPath).toBe(target);
					expect(path.dirname(temporaryPath)).toBe(directory);
					expect(await readFile(temporaryPath, 'utf8')).toBe('replacement-complete-artifact\n');
					throw failure;
				},
			}),
		).rejects.toBe(failure);

		expect(await readFile(target, 'utf8')).toBe('previous-complete-artifact\n');
		expect((await stat(target)).mtimeMs).toBe(before.mtimeMs);
		expect(await readdir(directory)).toEqual(['tantovale.openapi.json']);
	});

	it('preserves an existing artifact permission mode across atomic replacement', async () => {
		const directory = await temporaryDirectory();
		const target = path.join(directory, 'tantovale.openapi.json');
		await writeFile(target, 'previous-complete-artifact\n', 'utf8');
		await chmod(target, 0o640);

		await exporterModule.atomicWriteFile(target, Buffer.from('replacement-complete-artifact\n'), {
			syncDirectory: async () => undefined,
		});

		expect((await stat(target)).mode & 0o777).toBe(0o640);
	});

	it('uses normal 0666-masked creation permissions for a new artifact', async () => {
		const directory = await temporaryDirectory();
		const target = path.join(directory, 'tantovale.openapi.json');
		const expectedMode = 0o666 & ~process.umask();

		await exporterModule.atomicWriteFile(target, Buffer.from('new-complete-artifact\n'), {
			syncDirectory: async () => undefined,
		});

		expect((await stat(target)).mode & 0o777).toBe(expectedMode);
	});

	it('synchronizes the parent directory after publishing the replacement', async () => {
		const directory = await temporaryDirectory();
		const target = path.join(directory, 'tantovale.openapi.json');
		const synchronizedDirectories: string[] = [];

		await exporterModule.atomicWriteFile(target, Buffer.from('complete-artifact\n'), {
			syncDirectory: async (directoryPath) => {
				synchronizedDirectories.push(directoryPath);
			},
		});

		expect(synchronizedDirectories).toEqual([directory]);
	});

	it('reports a directory-sync failure after rename while retaining the complete replacement', async () => {
		const directory = await temporaryDirectory();
		const target = path.join(directory, 'tantovale.openapi.json');
		await writeFile(target, 'previous-complete-artifact\n', 'utf8');
		const failure = new Error('injected directory-sync failure');

		await expect(
			exporterModule.atomicWriteFile(target, Buffer.from('replacement-complete-artifact\n'), {
				syncDirectory: async () => {
					throw failure;
				},
			}),
		).rejects.toBe(failure);

		expect(await readFile(target, 'utf8')).toBe('replacement-complete-artifact\n');
		expect(await readdir(directory)).toEqual(['tantovale.openapi.json']);
	});

	it('only classifies documented directory open/fsync failures as unsupported', () => {
		const isUnsupportedDirectorySyncError = Reflect.get(exporterModule, 'isUnsupportedDirectorySyncError') as
			| ((error: unknown) => boolean)
			| undefined;
		expect(isUnsupportedDirectorySyncError, 'directory-sync compatibility classifier export').toBeTypeOf('function');
		if (!isUnsupportedDirectorySyncError) return;

		expect(
			isUnsupportedDirectorySyncError(Object.assign(new Error('directory open'), { code: 'EISDIR', syscall: 'open' })),
		).toBe(true);
		expect(
			isUnsupportedDirectorySyncError(
				Object.assign(new Error('directory fsync'), { code: 'EINVAL', syscall: 'fsync' }),
			),
		).toBe(true);
		expect(
			isUnsupportedDirectorySyncError(
				Object.assign(new Error('directory fsync'), { code: 'ENOTSUP', syscall: 'fsync' }),
			),
		).toBe(true);
		expect(
			isUnsupportedDirectorySyncError(
				Object.assign(new Error('permission denied'), { code: 'EPERM', syscall: 'open' }),
			),
		).toBe(false);
		expect(
			isUnsupportedDirectorySyncError(
				Object.assign(new Error('wrong operation'), { code: 'EINVAL', syscall: 'write' }),
			),
		).toBe(false);
		expect(isUnsupportedDirectorySyncError(new Error('unclassified failure'))).toBe(false);
	});

	it('keeps the complete previous bytes visible until the atomic rename publishes complete replacement bytes', async () => {
		const directory = await temporaryDirectory();
		const target = path.join(directory, 'tantovale.openapi.json');
		const previousBytes = 'previous-complete-artifact\n';
		const replacementBytes = 'replacement-complete-artifact\n'.repeat(4_096);
		await writeFile(target, previousBytes, 'utf8');
		const renameStarted = deferred();
		const releaseRename = deferred();

		const writing = exporterModule.atomicWriteFile(target, Buffer.from(replacementBytes), {
			rename: async (temporaryPath, destinationPath) => {
				expect(await readFile(temporaryPath, 'utf8')).toBe(replacementBytes);
				renameStarted.resolve();
				await releaseRename.promise;
				await rename(temporaryPath, destinationPath);
			},
		});
		await renameStarted.promise;
		expect(await readFile(target, 'utf8')).toBe(previousBytes);

		releaseRename.resolve();
		await writing;
		expect(await readFile(target, 'utf8')).toBe(replacementBytes);
		expect(await readdir(directory)).toEqual(['tantovale.openapi.json']);
	});

	it('restores every present and absent documentation environment key after an in-process render', async () => {
		const originalEnvironment = captureDocumentationEnvironment();
		try {
			const ambientEnvironment = installMixedAmbientEnvironment();
			const artifact = await exporterModule.renderOpenApiArtifact();
			expect((JSON.parse(artifact) as JsonObject).openapi).toBe('3.1.0');
			expect(captureDocumentationEnvironment()).toEqual(ambientEnvironment);
		} finally {
			restoreDocumentationEnvironment(originalEnvironment);
		}
	});

	it('restores every documentation environment key when app loading fails', async () => {
		const originalEnvironment = captureDocumentationEnvironment();
		try {
			const ambientEnvironment = installMixedAmbientEnvironment();
			const failure = new Error('injected app-load failure');
			await expect(
				exporterModule.renderOpenApiArtifact({
					loadApp: async () => {
						throw failure;
					},
				}),
			).rejects.toBe(failure);
			expect(captureDocumentationEnvironment()).toEqual(ambientEnvironment);
		} finally {
			restoreDocumentationEnvironment(originalEnvironment);
		}
	});

	it('serializes in-process renders so process environment leases cannot overlap', async () => {
		const originalEnvironment = captureDocumentationEnvironment();
		try {
			const ambientEnvironment = installMixedAmbientEnvironment();
			const firstStarted = deferred();
			const releaseFirst = deferred();
			let secondStarted = false;
			const first = exporterModule.renderOpenApiArtifact({
				loadApp: async () => {
					firstStarted.resolve();
					await releaseFirst.promise;
					return documentationApp();
				},
			});
			await firstStarted.promise;
			const second = exporterModule.renderOpenApiArtifact({
				loadApp: async () => {
					secondStarted = true;
					return documentationApp();
				},
			});

			await Promise.resolve();
			await Promise.resolve();
			expect(secondStarted).toBe(false);
			releaseFirst.resolve();
			await expect(first).resolves.toContain('"openapi": "3.1.0"');
			await expect(second).resolves.toContain('"openapi": "3.1.0"');
			expect(secondStarted).toBe(true);
			expect(captureDocumentationEnvironment()).toEqual(ambientEnvironment);
		} finally {
			restoreDocumentationEnvironment(originalEnvironment);
		}
	});

	it('exports deterministic, sorted, secret-free OpenAPI 3.1 bytes from any cwd', async () => {
		const firstDirectory = await temporaryDirectory();
		const secondDirectory = await temporaryDirectory();
		const firstTarget = path.join(firstDirectory, 'nested', 'tantovale.openapi.json');
		const secondTarget = path.join(secondDirectory, 'tantovale.openapi.json');
		const firstMarker = 'ambient-first-sensitive-value';
		const secondMarker = 'ambient-second-sensitive-value';

		const firstRun = runExporter([firstTarget], { cwd: serverDirectory, ambientMarker: firstMarker });
		const secondRun = runExporter([secondTarget], { cwd: secondDirectory, ambientMarker: secondMarker });

		expect(firstRun.status, firstRun.stderr).toBe(0);
		expect(secondRun.status, secondRun.stderr).toBe(0);
		const firstBytes = await readFile(firstTarget, 'utf8');
		const secondBytes = await readFile(secondTarget, 'utf8');
		expect(secondBytes).toBe(firstBytes);
		expect(firstBytes).toBe(`${JSON.stringify(JSON.parse(firstBytes), null, '\t')}\n`);
		expect(firstBytes.endsWith('\n')).toBe(true);
		expect(firstBytes.endsWith('\n\n')).toBe(false);
		expect(firstBytes).not.toContain('\r');
		expect(firstBytes).not.toContain(firstDirectory);
		expect(firstBytes).not.toContain(secondDirectory);
		expect(firstBytes).not.toContain(firstMarker);
		expect(firstBytes).not.toContain(secondMarker);
		expect(firstBytes).not.toContain('documentation-only-not-used');
		expect(`${firstRun.stdout}${firstRun.stderr}`).not.toContain(firstMarker);
		expect(`${secondRun.stdout}${secondRun.stderr}`).not.toContain(secondMarker);

		const document = JSON.parse(firstBytes) as JsonObject;
		expect(document.openapi).toBe('3.1.0');
		expect(document.servers).toEqual([{ url: 'http://localhost:4000' }]);
		expectRecursivelySorted(document);

		const operations = operationEntries(document);
		expect(operations).toHaveLength(63);
		expect(operations.map(([operation]) => operation.replaceAll(/\{([^}]+)\}/g, ':$1')).sort()).toEqual(
			routeContracts.map(({ method, path: routePath }) => `${method} ${routePath}`).sort(),
		);
		expect(new Set(operations.map(([, operation]) => operation.operationId)).size).toBe(63);
		expect((document.components as JsonObject).securitySchemes).toEqual({
			accessCookie: { in: 'cookie', name: 'access_token', type: 'apiKey' },
			cronKey: { in: 'query', name: 'key', type: 'apiKey' },
			refreshCookie: { in: 'cookie', name: 'refresh_token', type: 'apiKey' },
			trustapWebhookBasic: { scheme: 'basic', type: 'http' },
		});
		expect(sensitiveExamples(document)).toEqual([]);
		for (const reference of collectReferences(document)) {
			expect(reference, `unresolved OpenAPI reference ${reference}`).toMatch(/^#\//);
			expect(resolveJsonPointer(document, reference), reference).toBeDefined();
		}
	});

	it('checks without rewriting and export repairs missing or drifted artifacts', async () => {
		const directory = await temporaryDirectory();
		const target = path.join(directory, 'api', 'tantovale.openapi.json');

		const missingCheck = runExporter([target, '--check'], { cwd: directory });
		expect(missingCheck.status).not.toBe(0);
		await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });

		const exportRun = runExporter([target], { cwd: directory });
		expect(exportRun.status, exportRun.stderr).toBe(0);
		const canonicalBytes = await readFile(target, 'utf8');
		const tamperedBytes = canonicalBytes.replace('Tantovale API', 'Tantovale APX');
		expect(tamperedBytes).not.toBe(canonicalBytes);
		await writeFile(target, tamperedBytes, 'utf8');
		const preservedTimestamp = new Date('2020-01-02T03:04:05.000Z');
		await utimes(target, preservedTimestamp, preservedTimestamp);
		const beforeDriftCheck = await stat(target);

		const driftCheck = runExporter([target, '--check'], { cwd: directory });
		expect(driftCheck.status).not.toBe(0);
		expect(await readFile(target, 'utf8')).toBe(tamperedBytes);
		expect((await stat(target)).mtimeMs).toBe(beforeDriftCheck.mtimeMs);
		expect(`${driftCheck.stdout}${driftCheck.stderr}`).not.toContain('ambient-credential-must-not-appear');

		const repairRun = runExporter([target], { cwd: directory });
		expect(repairRun.status, repairRun.stderr).toBe(0);
		expect(await readFile(target, 'utf8')).toBe(canonicalBytes);
		const cleanCheck = runExporter([target, '--check'], { cwd: directory });
		expect(cleanCheck.status, cleanCheck.stderr).toBe(0);
		expect(await readFile(target, 'utf8')).toBe(canonicalBytes);
	});

	it('rejects missing targets and unknown CLI options without exposing ambient values', async () => {
		const directory = await temporaryDirectory();
		const marker = 'ambient-option-sensitive-value';

		for (const args of [[], ['--check'], ['artifact.json', `--${marker}`], ['one.json', 'two.json']]) {
			const result = runExporter(args, { cwd: directory, ambientMarker: marker });
			expect(result.status, args.join(' ')).not.toBe(0);
			expect(`${result.stdout}${result.stderr}`).not.toContain(marker);
		}
	});
});
