import { S3Client } from "@aws-sdk/client-s3";

export function s3Client(
  AWS_REGION: string,
  AWS_ACCESS_KEY_ID: string,
  AWS_SECRET_ACCESS_KEY: string,
) {
  return new S3Client({
    region: AWS_REGION!,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID!,
      secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    },
  });
}
