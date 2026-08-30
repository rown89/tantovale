import { environment } from '#utils/constants';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const s3Client = new S3Client({
	region: environment.AWS_REGION,
	endpoint: environment.AWS_ENDPOINT,
	forcePathStyle: environment.AWS_FORCE_PATH_STYLE,
	credentials: {
		accessKeyId: environment.AWS_ACCESS_KEY!,
		secretAccessKey: environment.AWS_SECRET_ACCESS_KEY!,
	},
});

export async function getObjectUrl(key: string) {
	const command = new GetObjectCommand({
		Bucket: environment.AWS_BUCKET_NAME,
		Key: key,
	});

	const url = await getSignedUrl(s3Client, command);

	return url;
}
