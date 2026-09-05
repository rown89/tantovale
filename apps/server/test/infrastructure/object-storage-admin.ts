import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';

import type { TestRuntime } from './runtime';

const OBJECT_STORAGE_TIMEOUT_MS = 10_000;

export function createObjectStorageClient(runtime: TestRuntime): S3Client {
	return new S3Client({
		endpoint: runtime.minio.endpoint,
		region: 'eu-west-1',
		forcePathStyle: true,
		credentials: {
			accessKeyId: runtime.minio.accessKey,
			secretAccessKey: runtime.minio.secretKey,
		},
	});
}

export async function createWorkerBuckets(runtime: TestRuntime): Promise<void> {
	const client = createObjectStorageClient(runtime);

	try {
		for (const bucket of runtime.resourceNames.workerBuckets) {
			await client.send(new CreateBucketCommand({ Bucket: bucket }), {
				abortSignal: AbortSignal.timeout(OBJECT_STORAGE_TIMEOUT_MS),
			});
		}
	} finally {
		client.destroy();
	}
}
