import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

export type StartedInfrastructure = {
	postgres: StartedTestContainer;
	minio: StartedTestContainer;
	mailpit: StartedTestContainer;
};

function getStartedContainer(result: PromiseSettledResult<StartedTestContainer>): StartedTestContainer {
	if (result.status === 'rejected') {
		throw result.reason;
	}

	return result.value;
}

export async function startInfrastructure(): Promise<StartedInfrastructure> {
	const [postgresResult, minioResult, mailpitResult] = await Promise.allSettled([
		new GenericContainer('postgres:17-alpine')
			.withEnvironment({
				POSTGRES_USER: 'tantovale_test',
				POSTGRES_PASSWORD: 'tantovale_test',
				POSTGRES_DB: 'postgres',
			})
			.withExposedPorts(5432)
			.withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
			.start(),
		new GenericContainer('minio/minio:RELEASE.2025-04-22T22-12-26Z')
			.withEnvironment({
				MINIO_ROOT_USER: 'tantovale_test',
				MINIO_ROOT_PASSWORD: 'tantovale_test_secret',
			})
			.withCommand(['server', '/data', '--console-address', ':9001'])
			.withExposedPorts(9000)
			.withWaitStrategy(Wait.forListeningPorts())
			.start(),
		new GenericContainer('axllent/mailpit:v1.27.8')
			.withExposedPorts(1025, 8025)
			.withWaitStrategy(Wait.forListeningPorts())
			.start(),
	]);
	const results = [postgresResult, minioResult, mailpitResult];

	const startedContainers = results
		.filter((result): result is PromiseFulfilledResult<StartedTestContainer> => result.status === 'fulfilled')
		.map((result) => result.value);

	if (results.some((result) => result.status === 'rejected')) {
		await Promise.allSettled(startedContainers.map((container) => container.stop()));
	}

	const postgres = getStartedContainer(postgresResult);
	const minio = getStartedContainer(minioResult);
	const mailpit = getStartedContainer(mailpitResult);

	return { postgres, minio, mailpit };
}
