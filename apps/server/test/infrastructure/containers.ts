import { GenericContainer, getContainerRuntimeClient, type StartedTestContainer, Wait } from 'testcontainers';

const STARTUP_TIMEOUT_MS = 120_000;
const POSTGRES_IMAGE = 'postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73';
const MINIO_IMAGE =
	'minio/minio:RELEASE.2025-04-22T22-12-26Z@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e';
const MAILPIT_IMAGE = 'axllent/mailpit:v1.27.8@sha256:6abc8e633df15eaf785cfcf38bae48e66f64beecdc03121e249d0f9ec15f0707';

export type StartedInfrastructure = {
	postgres: StartedTestContainer;
	minio: StartedTestContainer;
	mailpit: StartedTestContainer;
};

class TrackedGenericContainer extends GenericContainer {
	private createdContainerId: string | undefined;

	protected override async containerCreated(containerId: string): Promise<void> {
		this.createdContainerId = containerId;
	}

	async disposeFailedStart(): Promise<void> {
		if (!this.createdContainerId) {
			return;
		}

		const containerId = this.createdContainerId;
		this.createdContainerId = undefined;
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
	}
}

function getStartedContainer(result: PromiseSettledResult<StartedTestContainer>): StartedTestContainer {
	if (result.status === 'rejected') {
		throw result.reason;
	}

	return result.value;
}

async function startTrackedContainer(container: TrackedGenericContainer): Promise<StartedTestContainer> {
	try {
		return await container.start();
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
	await stopContainers([infrastructure.postgres, infrastructure.minio, infrastructure.mailpit]);
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
		),
		startTrackedContainer(
			new TrackedGenericContainer(MAILPIT_IMAGE)
				.withExposedPorts(1025, 8025)
				.withStartupTimeout(STARTUP_TIMEOUT_MS)
				.withWaitStrategy(Wait.forListeningPorts()),
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

		throw new AggregateError(startupErrors, 'Failed to start disposable infrastructure containers');
	}

	return {
		postgres: getStartedContainer(postgresResult),
		minio: getStartedContainer(minioResult),
		mailpit: getStartedContainer(mailpitResult),
	};
}
