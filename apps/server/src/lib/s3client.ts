import { parseEnv } from "#env";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3Client = new S3Client({
  region: parseEnv(process.env).AWS_REGION,
  credentials: {
    accessKeyId: parseEnv(process.env).AWS_ACCESS_KEY!,
    secretAccessKey: parseEnv(process.env).AWS_SECRET_ACCESS_KEY!,
  },
});

export async function getObjectUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: "tantovale-staging-bucket",
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command);

  return url;
}
