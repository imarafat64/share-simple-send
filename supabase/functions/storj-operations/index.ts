import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { encode as base64Encode, decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectVersionsCommand } from "npm:@aws-sdk/client-s3@3.450.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.450.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Storj DCS S3-compatible configuration
const STORJ_ENDPOINT = 'https://gateway.storjshare.io';
const DEFAULT_BUCKET = 'shyfto';

const createStorjClient = () => {
  const accessKeyId = Deno.env.get('STORJ_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('STORJ_SECRET_ACCESS_KEY');
  
  console.log('Checking Storj credentials...');
  console.log('Access Key ID present:', !!accessKeyId);
  console.log('Secret Access Key present:', !!secretAccessKey);
  
  if (!accessKeyId || !secretAccessKey) {
    const errorMsg = 'Storj credentials not configured. Please add STORJ_ACCESS_KEY_ID and STORJ_SECRET_ACCESS_KEY secrets in Supabase Dashboard > Settings > Edge Functions';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  
  return new S3Client({
    endpoint: STORJ_ENDPOINT,
    region: 'us-east-1',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  });
};

// Permanently remove all versions (and delete markers) for a key
async function deleteAllVersions(client: S3Client, bucket: string, key: string): Promise<void> {
  try {
    let isTruncated = true;
    let KeyMarker: string | undefined = undefined;
    let VersionIdMarker: string | undefined = undefined;
    const objectsToDelete: { Key: string; VersionId: string }[] = [];

    while (isTruncated) {
      const list = await client.send(new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: key,
        KeyMarker,
        VersionIdMarker,
      }));

      const versions = (list.Versions || []).filter(v => v.Key === key && v.VersionId);
      const deleteMarkers = (list.DeleteMarkers || []).filter(m => m.Key === key && m.VersionId);

      for (const v of versions) {
        if (v.VersionId) objectsToDelete.push({ Key: key, VersionId: v.VersionId });
      }
      for (const m of deleteMarkers) {
        if (m.VersionId) objectsToDelete.push({ Key: key, VersionId: m.VersionId });
      }

      isTruncated = !!list.IsTruncated;
      KeyMarker = list.NextKeyMarker;
      VersionIdMarker = list.NextVersionIdMarker;
    }

    if (objectsToDelete.length === 0) {
      // Bucket may be unversioned; do a standard delete
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return;
    }

    // S3 DeleteObjects supports up to 1000 per call; chunk just in case
    for (let i = 0; i < objectsToDelete.length; i += 1000) {
      const chunk = objectsToDelete.slice(i, i + 1000);
      await client.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk, Quiet: true },
      }));
    }
  } catch (err) {
    console.error('Failed to delete all versions for key:', key, err);
    throw err;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData = await req.json();
    const { operation, filePath, files, fileData, contentType, size, bucket } = requestData;
    const bucketName = bucket || DEFAULT_BUCKET;
    const client = createStorjClient();

    console.log(`Storj operation: ${operation}, bucket: ${bucketName}, filePath: ${filePath}`);

    switch (operation) {
      case 'upload': {        
        // Convert base64 back to file data safely
        const buffer = base64Decode(fileData);
        
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: filePath,
          Body: buffer,
          ContentType: contentType,
        });

        await client.send(command);
        
        return new Response(
          JSON.stringify({ success: true }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      }

      case 'download': {
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: filePath,
        });

        const response = await client.send(command);
        
        if (!response.Body) {
          throw new Error('No file content received');
        }

        // Convert stream to base64
        const chunks: Uint8Array[] = [];
        const reader = response.Body.transformToWebStream().getReader();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        
        const fullArray = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
          fullArray.set(chunk, offset);
          offset += chunk.length;
        }
        
        // Encode to base64 safely without argument expansion
        const base64 = base64Encode(fullArray);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            data: base64,
            contentType: response.ContentType 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      }

      case 'delete': {
        await deleteAllVersions(client, bucketName, filePath);
        return new Response(
          JSON.stringify({ success: true }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      }

      case 'delete-multiple': {
        // Permanently delete all versions for each file
        for (const path of files) {
          await deleteAllVersions(client, bucketName, path);
        }
        
        return new Response(
          JSON.stringify({ success: true }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      }

      case 'get-download-url': {
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: filePath,
        });
        // Generate short-lived pre-signed URL (10 minutes)
        const url = await getSignedUrl(client, command, { expiresIn: 60 * 10 });
        return new Response(
          JSON.stringify({ success: true, url }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid operation' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400 
          }
        );
    }
  } catch (error) {
    console.error('Storj operation error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
})