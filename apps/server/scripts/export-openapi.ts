import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename as renameFile, stat, unlink, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const CANONICAL_OPENAPI_URL = 'http://localhost:4000/openapi';
const SERVER_DIRECTORY = fileURLToPath(new URL('..', import.meta.url));

const DOCUMENTATION_ENVIRONMENT = {
	NODE_ENV: 'test',
	LOG_LEVEL: 'silent',
	PROJECT_NAME: 'Tantovale documentation',
	NEXT_PUBLIC_HONO_API_URL: 'http://localhost:4000',
	SERVER_HOSTNAME: 'localhost',
	SERVER_PORT: '4000',
	STOREFRONT_HOSTNAME: 'http://localhost:3000',
	STOREFRONT_PORT: '3000',
	POSTGRES_USER: 'documentation',
	POSTGRES_PASSWORD: 'documentation-only-not-used',
	DATABASE_HOST: '127.0.0.1',
	DATABASE_PORT: '1',
	POSTGRES_DB: 'documentation',
	PAYMENT_PROVIDER_API_URL: 'http://127.0.0.1:1',
	PAYMENT_PROVIDER_API_VERSION: 'api/v1',
	PAYMENT_PROVIDER_API_KEY: 'documentation-only-not-used',
	PAYMENT_PROVIDER_CLIENT_ID: 'documentation',
	PAYMENT_PROVIDER_CLIENT_SECRET: 'documentation-only-not-used',
	PAYMENT_PROVIDER_WEBHOOK_USERNAME: 'documentation',
	PAYMENT_PROVIDER_WEBHOOK_SECRET: 'documentation-only-not-used',
	PAYMENT_PROVIDER_PAY_PAGE_URL: 'http://127.0.0.1:1/transactions',
	POST_PAYMENT_REDIRECT_URL: 'http://localhost:3000',
	PROVIDER_REQUEST_TIMEOUT_MS: '1000',
	SHIPPING_PROVIDER_API_KEY: 'documentation-only-not-used',
	SHIPPING_PROVIDER_WEBHOOK_SECRET: 'documentation-only-not-used',
	SHIPPING_PROVIDER_API_URL: 'http://127.0.0.1:1',
	ACCESS_TOKEN_SECRET: 'documentation-only-not-used',
	REFRESH_TOKEN_SECRET: 'documentation-only-not-used',
	EMAIL_VERIFY_TOKEN_SECRET: 'documentation-only-not-used',
	RESET_TOKEN_SECRET: 'documentation-only-not-used',
	COOKIE_SECRET: 'documentation-only-not-used',
	AWS_REGION: 'eu-west-1',
	AWS_ACCESS_KEY: 'documentation-only-not-used',
	AWS_SECRET_ACCESS_KEY: 'documentation-only-not-used',
	AWS_BUCKET_NAME: 'documentation',
	AWS_ENDPOINT: 'http://127.0.0.1:1',
	AWS_FORCE_PATH_STYLE: 'true',
	SMTP_HOST: '127.0.0.1',
	SMTP_PORT: '1',
	SMTP_USER: 'documentation',
	SMTP_PASS: 'documentation-only-not-used',
	SMTP_FROM: 'Tantovale <noreply@localhost>',
	SMTP_REQUEST_TIMEOUT_MS: '1000',
	DAILY_ORDER_CHECK_SECRET_KEY: 'documentation-orders-not-used',
	DAILY_ORDER_PROPOSALS_CHECK_SECRET_KEY: 'documentation-proposals-not-used',
	TRANSACTIONS_SYNC_SECRET_KEY: 'documentation-transactions-not-used',
	PROPOSALS_HANDLING_TOLLERANCE_IN_HOURS: '96',
	ORDERS_PAYMENT_HANDLING_TOLLERANCE_IN_HOURS: '48',
} satisfies NodeJS.ProcessEnv;

class OpenApiExportError extends Error {}

type OpenApiApp = {
	request: (input: string) => Promise<Response> | Response;
};

type RenderOpenApiOptions = {
	loadApp?: () => Promise<{ app: OpenApiApp }>;
};

type AtomicWriteOptions = {
	rename?: (oldPath: string, newPath: string) => Promise<void>;
	syncDirectory?: (directoryPath: string) => Promise<void>;
};

type EnvironmentSnapshot = Array<{ exists: boolean; key: string; value?: string }>;

let renderQueue: Promise<void> = Promise.resolve();

export function sortJsonValue(value: JsonValue): JsonValue {
	if (Array.isArray(value)) return value.map(sortJsonValue);
	if (value === null || typeof value !== 'object') return value;

	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
			.map(([key, entry]) => [key, sortJsonValue(entry)]),
	);
}

function installDocumentationEnvironment(): () => void {
	const snapshot: EnvironmentSnapshot = Object.keys(DOCUMENTATION_ENVIRONMENT).map((key) => ({
		exists: Object.hasOwn(process.env, key),
		key,
		...(process.env[key] === undefined ? {} : { value: process.env[key] }),
	}));

	Object.assign(process.env, DOCUMENTATION_ENVIRONMENT);
	return () => {
		for (const entry of snapshot) {
			if (entry.exists) process.env[entry.key] = entry.value;
			else delete process.env[entry.key];
		}
	};
}

async function loadOpenApiApp(): Promise<{ app: OpenApiApp }> {
	const { app } = (await tsImport('../src/app.ts', {
		parentURL: import.meta.url,
		tsconfig: path.join(SERVER_DIRECTORY, 'tsconfig.json'),
	})) as typeof import('../src/app');
	return { app };
}

async function renderOpenApiArtifactWithEnvironment(options: RenderOpenApiOptions): Promise<string> {
	const restoreEnvironment = installDocumentationEnvironment();
	try {
		const { app } = await (options.loadApp ?? loadOpenApiApp)();
		const response = await app.request(CANONICAL_OPENAPI_URL);

		if (!response.ok) throw new OpenApiExportError('OpenAPI generation failed.');

		let document: JsonValue;
		try {
			document = (await response.json()) as JsonValue;
		} catch {
			throw new OpenApiExportError('OpenAPI generation failed.');
		}

		return `${JSON.stringify(sortJsonValue(document), null, '\t')}\n`;
	} finally {
		restoreEnvironment();
	}
}

export function renderOpenApiArtifact(options: RenderOpenApiOptions = {}): Promise<string> {
	const rendering = renderQueue.then(() => renderOpenApiArtifactWithEnvironment(options));
	renderQueue = rendering.then(
		() => undefined,
		() => undefined,
	);
	return rendering;
}

async function removeTemporaryFile(temporaryPath: string, originalError: unknown): Promise<never> {
	try {
		await unlink(temporaryPath);
	} catch (cleanupError) {
		if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw new AggregateError([originalError, cleanupError], 'OpenAPI export and temporary-file cleanup failed.');
		}
	}
	throw originalError;
}

export function isUnsupportedDirectorySyncError(error: unknown, platform: NodeJS.Platform): boolean {
	const filesystemError = error as NodeJS.ErrnoException;
	return (
		(filesystemError.syscall === 'open' && filesystemError.code === 'EISDIR') ||
		(filesystemError.syscall === 'fsync' &&
			(filesystemError.code === 'EINVAL' ||
				filesystemError.code === 'ENOTSUP' ||
				(platform === 'win32' && filesystemError.code === 'EPERM')))
	);
}

async function syncParentDirectory(directoryPath: string): Promise<void> {
	let directoryHandle: FileHandle | undefined;
	try {
		directoryHandle = await open(directoryPath, 'r');
		await directoryHandle.sync();
	} catch (error) {
		// Directory handles may be unavailable (EISDIR), some filesystems reject
		// their fsync (EINVAL/ENOTSUP), and Windows reports EPERM for that fsync.
		// EPERM anywhere else remains a real permission failure.
		if (!isUnsupportedDirectorySyncError(error, process.platform)) throw error;
	} finally {
		await directoryHandle?.close();
	}
}

async function replacementPermissions(targetPath: string): Promise<number> {
	try {
		return (await stat(targetPath)).mode & 0o777;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		return 0o666 & ~process.umask();
	}
}

export async function atomicWriteFile(
	targetPath: string,
	contents: Uint8Array,
	options: AtomicWriteOptions = {},
): Promise<void> {
	const targetDirectory = path.dirname(targetPath);
	const temporaryPath = path.join(targetDirectory, `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`);
	let handle: FileHandle | undefined;

	try {
		const finalPermissions = await replacementPermissions(targetPath);
		handle = await open(temporaryPath, 'wx', 0o600);
		await handle.writeFile(contents);
		await handle.chmod(finalPermissions);
		await handle.sync();
		await handle.close();
		handle = undefined;
		await (options.rename ?? renameFile)(temporaryPath, targetPath);
		await (options.syncDirectory ?? syncParentDirectory)(targetDirectory);
	} catch (error) {
		if (handle) {
			try {
				await handle.close();
			} catch {
				// Cleanup below is still attempted; the original error remains authoritative.
			}
		}
		await removeTemporaryFile(temporaryPath, error);
	}
}

function parseArguments(args: string[]): { check: boolean; targetPath: string } {
	if (
		(args.length !== 1 && args.length !== 2) ||
		!args[0] ||
		args[0].startsWith('-') ||
		(args.length === 2 && args[1] !== '--check')
	) {
		throw new OpenApiExportError('Usage: export-openapi <target> [--check]');
	}

	return { check: args[1] === '--check', targetPath: path.resolve(args[0]) };
}

export async function runOpenApiExport(args: string[]): Promise<void> {
	const { check, targetPath } = parseArguments(args);
	const generatedBytes = Buffer.from(await renderOpenApiArtifact(), 'utf8');

	if (check) {
		let currentBytes: Buffer;
		try {
			currentBytes = await readFile(targetPath);
		} catch {
			throw new OpenApiExportError('OpenAPI artifact is missing or stale.');
		}
		if (!currentBytes.equals(generatedBytes)) {
			throw new OpenApiExportError('OpenAPI artifact is missing or stale.');
		}
		return;
	}

	await mkdir(path.dirname(targetPath), { recursive: true });
	await atomicWriteFile(targetPath, generatedBytes);
}

function isDirectExecution(): boolean {
	const entrypoint = process.argv[1];
	return entrypoint !== undefined && pathToFileURL(path.resolve(entrypoint)).href === import.meta.url;
}

if (isDirectExecution()) {
	runOpenApiExport(process.argv.slice(2)).catch((error: unknown) => {
		console.error(error instanceof OpenApiExportError ? error.message : 'OpenAPI export failed.');
		process.exitCode = 1;
	});
}
