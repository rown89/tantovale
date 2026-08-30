import { GenericContainer, getContainerRuntimeClient, type StartedTestContainer, Wait } from 'testcontainers';

const STARTUP_TIMEOUT_MS = 120_000;
const END_TO_END_STARTUP_TIMEOUT_MS = 240_000;
const BACKGROUND_CLEANUP_TIMEOUT_MS = 30_000;
const POSTGRES_IMAGE = 'postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73';
const MINIO_IMAGE =
	'minio/minio:RELEASE.2025-04-22T22-12-26Z@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e';
const MAILPIT_IMAGE = 'axllent/mailpit:v1.27.8@sha256:6abc8e633df15eaf785cfcf38bae48e66f64beecdc03121e249d0f9ec15f0707';

export type StartedInfrastructure = {
	postgres: StartedTestContainer;
	minio: StartedTestContainer;
	mailpit: StartedTestContainer;
};

const backgroundCleanupPromises = new Set<Promise<void>>();
const backgroundCleanupErrors: unknown[] = [];

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function registerBackgroundCleanup(cleanup: Promise<void>): void {
	const handledCleanup = cleanup.catch((error: unknown) => {
		backgroundCleanupErrors.push(error);
	});

	backgroundCleanupPromises.add(handledCleanup);
	void handledCleanup.then(() => {
		backgroundCleanupPromises.delete(handledCleanup);
	});
}

export async function drainBackgroundCleanup(timeoutMs = BACKGROUND_CLEANUP_TIMEOUT_MS): Promise<void> {
	let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timeoutHandle = setTimeout(() => {
			reject(new Error(`Timed out draining background container cleanup after ${timeoutMs}ms`));
		}, timeoutMs);
	});
	let timeoutError: unknown;

	try {
		while (backgroundCleanupPromises.size > 0) {
			await Promise.race([Promise.all([...backgroundCleanupPromises]), deadline]);
		}
	} catch (error) {
		timeoutError = error;
	} finally {
		if (timeoutHandle) {
			clearTimeout(timeoutHandle);
		}
	}

	const errors = timeoutError
		? [timeoutError, ...backgroundCleanupErrors.splice(0)]
		: backgroundCleanupErrors.splice(0);
	if (errors.length > 0) {
		throw new AggregateError(errors, `Background container cleanup failed: ${errors.map(errorMessage).join('; ')}`);
	}
}

export function createSerializedCleanupOwner(cleanup: () => Promise<void>): () => Promise<void> {
	let cleanupPromise: Promise<void> | undefined;

	return () => {
		if (!cleanupPromise) {
			cleanupPromise = Promise.resolve()
				.then(cleanup)
				.catch((error: unknown) => {
					cleanupPromise = undefined;
					throw error;
				});
		}

		return cleanupPromise;
	};
}

class TrackedGenericContainer extends GenericContainer {
	private createdContainerId: string | undefined;
	private cleanupOwner: (() => Promise<void>) | undefined;

	protected override async containerCreated(containerId: string): Promise<void> {
		this.createdContainerId = containerId;
		this.cleanupOwner = createSerializedCleanupOwner(() => this.cleanupCreatedContainer());
	}

	async disposeFailedStart(): Promise<void> {
		return this.cleanupOwner?.() ?? Promise.resolve();
	}

	private async cleanupCreatedContainer(): Promise<void> {
		const containerId = this.createdContainerId;
		if (!containerId) {
			return;
		}

		const client = await getContainerRuntimeClient();
		const container = client.container.getById(containerId);
		const cleanupErrors: unknown[] = [];

		try {
			const inspectResult = await client.container.inspect(container);
			if (inspectResult.State.Running) {
				await client.container.stop(container, { timeout: 0 });
			}
		} catch (error) {
			cleanupErrors.push(error);
		}

		try {
			await client.container.remove(container, { removeVolumes: true });
		} catch (error) {
			cleanupErrors.push(error);
		}

		if (cleanupErrors.length > 0) {
			throw new AggregateError(cleanupErrors, `Failed to clean up container ${containerId} after startup failure`);
		}

		this.createdContainerId = undefined;
	}
}

function getStartedContainer(result: PromiseSettledResult<StartedTestContainer>): StartedTestContainer {
	if (result.status === 'rejected') {
		throw result.reason;
	}

	return result.value;
}

export async function startWithDeadline<T>(
	start: () => Promise<T>,
	cleanupAfterTimeout: () => Promise<void>,
	cleanupAfterLateSettlement: () => Promise<void>,
	description: string,
	timeoutMs = END_TO_END_STARTUP_TIMEOUT_MS,
): Promise<T> {
	let timedOut = false;
	let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
	let timeoutCleanup: Promise<void> | undefined;
	const startPromise = Promise.resolve().then(start);
	const lateSettlementCleanup = startPromise.then(
		() => {
			if (timedOut) {
				return cleanupAfterLateSettlement();
			}
		},
		() => {
			if (timedOut) {
				return cleanupAfterLateSettlement();
			}
		},
	);
	const deadline = new Promise<never>((_, reject) => {
		timeoutHandle = setTimeout(() => {
			timedOut = true;
			timeoutCleanup = Promise.resolve().then(cleanupAfterTimeout);
			registerBackgroundCleanup(lateSettlementCleanup);
			reject(new Error(`Timed out starting ${description} after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	try {
		return await Promise.race([startPromise, deadline]);
	} catch (startupError) {
		if (timedOut && timeoutCleanup) {
			try {
				await timeoutCleanup;
			} catch (cleanupError) {
				throw new AggregateError([startupError, cleanupError], 'Container startup deadline and cleanup both failed');
			}
		}

		throw startupError;
	} finally {
		if (timeoutHandle) {
			clearTimeout(timeoutHandle);
		}
	}
}

async function startTrackedContainer(
	container: TrackedGenericContainer,
	description: string,
): Promise<StartedTestContainer> {
	try {
		return await startWithDeadline(
			() => container.start(),
			() => container.disposeFailedStart(),
			() => container.disposeFailedStart(),
			description,
		);
	} catch (startupError) {
		try {
			await container.disposeFailedStart();
		} catch (cleanupError) {
			throw new AggregateError([startupError, cleanupError], 'Container startup and cleanup both failed');
		}

		throw startupError;
	}
}

async function stopContainers(containers: StartedTestContainer[]): Promise<void> {
	const results = await Promise.allSettled(containers.map((container) => container.stop()));
	const errors = results
		.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
		.map((result) => result.reason);

	if (errors.length > 0) {
		throw new AggregateError(errors, 'Failed to stop disposable infrastructure containers');
	}
}

export async function stopInfrastructure(infrastructure: StartedInfrastructure): Promise<void> {
	const errors: unknown[] = [];

	try {
		await stopContainers([infrastructure.postgres, infrastructure.minio, infrastructure.mailpit]);
	} catch (error) {
		errors.push(error);
	}

	try {
		await drainBackgroundCleanup();
	} catch (error) {
		errors.push(error);
	}

	if (errors.length > 0) {
		throw new AggregateError(errors, 'Failed to stop disposable infrastructure containers and drain cleanup');
	}
}

export async function startInfrastructure(): Promise<StartedInfrastructure> {
	const [postgresResult, minioResult, mailpitResult] = await Promise.allSettled([
		startTrackedContainer(
			new TrackedGenericContainer(POSTGRES_IMAGE)
				.withEnvironment({
					POSTGRES_USER: 'tantovale_test',
					POSTGRES_PASSWORD: 'tantovale_test',
					POSTGRES_DB: 'postgres',
				})
				.withExposedPorts(5432)
				.withStartupTimeout(STARTUP_TIMEOUT_MS)
				.withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2)),
			POSTGRES_IMAGE,
		),
		startTrackedContainer(
			new TrackedGenericContainer(MINIO_IMAGE)
				.withEnvironment({
					MINIO_ROOT_USER: 'tantovale_test',
					MINIO_ROOT_PASSWORD: 'tantovale_test_secret',
				})
				.withCommand(['server', '/data', '--console-address', ':9001'])
				.withExposedPorts(9000)
				.withStartupTimeout(STARTUP_TIMEOUT_MS)
				.withWaitStrategy(Wait.forHttp('/minio/health/ready', 9000)),
			MINIO_IMAGE,
		),
		startTrackedContainer(
			new TrackedGenericContainer(MAILPIT_IMAGE)
				.withExposedPorts(1025, 8025)
				.withStartupTimeout(STARTUP_TIMEOUT_MS)
				.withWaitStrategy(Wait.forListeningPorts()),
			MAILPIT_IMAGE,
		),
	]);
	const results = [postgresResult, minioResult, mailpitResult];
	const startedContainers = results
		.filter((result): result is PromiseFulfilledResult<StartedTestContainer> => result.status === 'fulfilled')
		.map((result) => result.value);
	const startupErrors = results
		.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
		.map((result) => result.reason);

	if (startupErrors.length > 0) {
		try {
			await stopContainers(startedContainers);
		} catch (cleanupError) {
			startupErrors.push(cleanupError);
		}

		try {
			await drainBackgroundCleanup();
		} catch (cleanupError) {
			startupErrors.push(cleanupError);
		}

		throw new AggregateError(startupErrors, 'Failed to start disposable infrastructure containers');
	}

	return {
		postgres: getStartedContainer(postgresResult),
		minio: getStartedContainer(minioResult),
		mailpit: getStartedContainer(mailpitResult),
	};
}
