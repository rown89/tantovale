import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

import { environment } from '../../src/utils/constants';

const OBJECT_STORAGE_TIMEOUT_MS = 10_000;

export function createTestObjectStorageClient(): S3Client {
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

export async function resetObjectStorage(): Promise<void> {
	const client = createTestObjectStorageClient();

	try {
		while (true) {
			const listed = await client.send(new ListObjectsV2Command({ Bucket: environment.AWS_BUCKET_NAME }), {
				abortSignal: AbortSignal.timeout(OBJECT_STORAGE_TIMEOUT_MS),
			});
			const objects = listed.Contents?.flatMap(({ Key }) => (Key ? [{ Key }] : [])) ?? [];

			if (objects.length === 0) {
				return;
			}

			await client.send(
				new DeleteObjectsCommand({
					Bucket: environment.AWS_BUCKET_NAME,
					Delete: { Objects: objects },
				}),
				{ abortSignal: AbortSignal.timeout(OBJECT_STORAGE_TIMEOUT_MS) },
			);
		}
	} finally {
		client.destroy();
	}
}
