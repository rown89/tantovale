import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';

import { sortJsonValue } from '../../scripts/export-openapi';
import { routeContracts } from './route-registry';

type JsonObject = Record<string, unknown>;

const serverDirectory = fileURLToPath(new URL('../..', import.meta.url));
const scriptPath = path.join(serverDirectory, 'scripts', 'export-openapi.ts');
const tsxLoaderPath = createRequire(import.meta.url).resolve('tsx');
const temporaryDirectories: string[] = [];

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
			sortJsonValue({
				z: [{ z: 1, a: 2 }, 'first'],
				a: { z: true, a: false },
			}),
		).toEqual({
			a: { a: false, z: true },
			z: [{ a: 2, z: 1 }, 'first'],
		});
		expect(Object.keys(sortJsonValue({ z: 1, a: 2 }) as JsonObject)).toEqual(['a', 'z']);
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

		const driftCheck = runExporter([target, '--check'], { cwd: directory });
		expect(driftCheck.status).not.toBe(0);
		expect(await readFile(target, 'utf8')).toBe(tamperedBytes);
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
