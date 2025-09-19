import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "npm:@aws-sdk/client-s3@3.450.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Storj DCS S3-compatible configuration
const STORJ_ENDPOINT = 'https://gateway.storjshare.io';
const STORJ_BUCKET = 'shyfto';

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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData = await req.json();
    const { operation, filePath, files, fileData, contentType, size } = requestData;
    const client = createStorjClient();

    console.log(`Storj operation: ${operation}, filePath: ${filePath}`);

    switch (operation) {
      case 'upload': {        
        // Convert base64 back to file data
        const buffer = Uint8Array.from(atob(fileData), c => c.charCodeAt(0));
        
        const command = new PutObjectCommand({
          Bucket: STORJ_BUCKET,
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
          Bucket: STORJ_BUCKET,
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
        
        // Convert to base64
        const base64 = btoa(String.fromCharCode(...fullArray));
        
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
        const command = new DeleteObjectCommand({
          Bucket: STORJ_BUCKET,
          Key: filePath,
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

      case 'delete-multiple': {
        // Delete files sequentially
        for (const path of files) {
          const command = new DeleteObjectCommand({
            Bucket: STORJ_BUCKET,
            Key: path,
          });
          await client.send(command);
        }
        
        return new Response(
          JSON.stringify({ success: true }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
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