import { DeleteObjectsCommand, GetBucketVersioningCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

import { environment } from '../../src/utils/constants';

const OBJECT_STORAGE_TIMEOUT_MS = 10_000;
const disposableWorkerBucketName = /^tantovale-test-[a-z0-9]+-worker-[1-9][0-9]*$/;

function assertExpectedWorkerObjectStorage(expectedBucket: string, expectedEndpoint: string): void {
	if (!disposableWorkerBucketName.test(expectedBucket)) {
		throw new Error(`Refusing destructive operation: ${expectedBucket || '<empty>'} is not a disposable worker bucket`);
	}

	if (environment.AWS_BUCKET_NAME !== expectedBucket) {
		throw new Error('Object storage environment bucket does not match the assigned worker bucket');
	}

	if (environment.AWS_ENDPOINT !== expectedEndpoint) {
		throw new Error('Object storage environment endpoint does not match the assigned worker endpoint');
	}
}

export function createTestObjectStorageClient(expectedBucket: string, expectedEndpoint: string): S3Client {
	assertExpectedWorkerObjectStorage(expectedBucket, expectedEndpoint);

	return new S3Client({
		endpoint: environment.AWS_ENDPOINT,
		region: environment.AWS_REGION,
		forcePathStyle: environment.AWS_FORCE_PATH_STYLE,
		credentials: {
			accessKeyId: environment.AWS_ACCESS_KEY,
			secretAccessKey: environment.AWS_SECRET_ACCESS_KEY,
		},
	});
}

export async function resetObjectStorage(expectedBucket: string, expectedEndpoint: string): Promise<void> {
	assertExpectedWorkerObjectStorage(expectedBucket, expectedEndpoint);
	const client = createTestObjectStorageClient(expectedBucket, expectedEndpoint);

	try {
		const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: expectedBucket }), {
			abortSignal: AbortSignal.timeout(OBJECT_STORAGE_TIMEOUT_MS),
		});

		if (versioning.Status) {
			throw new Error('Refusing to reset a versioned worker bucket');
		}

		while (true) {
			const listed = await client.send(new ListObjectsV2Command({ Bucket: expectedBucket }), {
				abortSignal: AbortSignal.timeout(OBJECT_STORAGE_TIMEOUT_MS),
			});
			const objects = listed.Contents?.flatMap(({ Key }) => (Key ? [{ Key }] : [])) ?? [];

			if (objects.length === 0) {
				return;
			}

			const deleted = await client.send(
				new DeleteObjectsCommand({
					Bucket: expectedBucket,
					Delete: { Objects: objects },
				}),
				{ abortSignal: AbortSignal.timeout(OBJECT_STORAGE_TIMEOUT_MS) },
			);
			const errors = deleted.Errors ?? [];

			if (errors.length > 0) {
				throw new AggregateError(
					errors.map(({ Code }) => new Error(`Object deletion failed with code ${Code ?? 'Unknown'}`)),
					`Failed to delete ${errors.length} object(s) from the assigned worker bucket`,
				);
			}
		}
	} finally {
		client.destroy();
	}
}
