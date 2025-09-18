import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// Storj DCS S3-compatible configuration
const STORJ_ENDPOINT = 'https://gateway.storjshare.io';
const STORJ_BUCKET = 'shyfto';

// Create S3 client configured for Storj
const createStorjClient = () => {
  // These credentials need to be provided by the user
  // For now, we'll use placeholder values that need to be replaced
  const accessKeyId = process.env.STORJ_ACCESS_KEY_ID || 'your-storj-access-key';
  const secretAccessKey = process.env.STORJ_SECRET_ACCESS_KEY || 'your-storj-secret-key';
  
  return new S3Client({
    endpoint: STORJ_ENDPOINT,
    region: 'us1', // Storj uses 'us1' as the region
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true, // Required for S3-compatible services
  });
};

export const storjService = {
  async uploadFile(file: File, filePath: string): Promise<void> {
    const client = createStorjClient();
    
    const command = new PutObjectCommand({
      Bucket: STORJ_BUCKET,
      Key: filePath,
      Body: file,
      ContentType: file.type,
      ContentLength: file.size,
    });

    await client.send(command);
  },

  async downloadFile(filePath: string): Promise<Blob> {
    const client = createStorjClient();
    
    const command = new GetObjectCommand({
      Bucket: STORJ_BUCKET,
      Key: filePath,
    });

    const response = await client.send(command);
    
    if (!response.Body) {
      throw new Error('No file content received');
    }

    // Convert the stream to blob
    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    const blob = new Blob(chunks, { type: response.ContentType });
    return blob;
  },

  async deleteFile(filePath: string): Promise<void> {
    const client = createStorjClient();
    
    const command = new DeleteObjectCommand({
      Bucket: STORJ_BUCKET,
      Key: filePath,
    });

    await client.send(command);
  },

  async deleteFiles(filePaths: string[]): Promise<void> {
    // Delete files sequentially
    for (const filePath of filePaths) {
      await this.deleteFile(filePath);
    }
  },
};