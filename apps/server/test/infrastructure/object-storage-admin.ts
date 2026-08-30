import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';

import type { TestRuntime } from './runtime';

export async function createWorkerBuckets(runtime: TestRuntime): Promise<void> {
	const client = new S3Client({
		endpoint: runtime.minio.endpoint,
		region: 'eu-west-1',
		forcePathStyle: true,
		credentials: {
			accessKeyId: runtime.minio.accessKey,
			secretAccessKey: runtime.minio.secretKey,
		},
	});

	try {
		for (const bucket of runtime.resourceNames.workerBuckets) {
			await client.send(new CreateBucketCommand({ Bucket: bucket }));
		}
	} finally {
		client.destroy();
	}
}
