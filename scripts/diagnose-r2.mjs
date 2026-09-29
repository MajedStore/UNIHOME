import nextEnv from '@next/env';
import { S3Client, ListBucketsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
nextEnv.loadEnvConfig(process.cwd(), true);
for (const jurisdiction of ['', 'eu.', 'fedramp.']) {
  const client = new S3Client({ region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.${jurisdiction}r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }, maxAttempts: 1 });
  const label = jurisdiction || 'default';
  try {
    await client.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, MaxKeys: 1 }), { abortSignal: AbortSignal.timeout(10000) });
    console.log(JSON.stringify({ endpoint: label, bucketAccess: 'OK' }));
  } catch (e) { console.log(JSON.stringify({ endpoint: label, operation: 'bucket access', code: /^[A-Za-z0-9]+$/.test(e.name) ? e.name : 'Unknown', status: e.$metadata?.httpStatusCode })); }
  try {
    const result = await client.send(new ListBucketsCommand({}), { abortSignal: AbortSignal.timeout(10000) });
    console.log(JSON.stringify({ endpoint: label, configuredBucket: process.env.R2_BUCKET, availableBuckets: result.Buckets?.map(b => b.Name) }));
  } catch (e) { console.log(JSON.stringify({ endpoint: label, operation: 'list buckets', code: /^[A-Za-z0-9]+$/.test(e.name) ? e.name : 'Unknown', status: e.$metadata?.httpStatusCode })); }
  client.destroy();
}
