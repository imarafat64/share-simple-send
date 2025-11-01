import { supabase } from '@/integrations/supabase/client';

// Storj service that uses edge function
export const storjService = {
  async uploadFile(file: File, filePath: string, onProgress?: (progress: number) => void, bucket?: string): Promise<void> {
    // Convert file to base64 for transmission in chunks to avoid stack overflow
    const buffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    
    // Convert to base64 in chunks to avoid maximum call stack size exceeded
    let binaryString = '';
    const chunkSize = 65536; // Process 64KB at a time for maximum performance
    let lastReportedProgress = -1;
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binaryString += String.fromCharCode(...chunk);
      
      // Throttle progress updates - only report when progress changes by at least 5%
      if (onProgress) {
        const progress = Math.floor((i / uint8Array.length) * 50);
        if (progress - lastReportedProgress >= 5) {
          onProgress(progress);
          lastReportedProgress = progress;
        }
      }
    }
    
    const base64 = btoa(binaryString);
    
    if (onProgress) onProgress(50); // Conversion complete
    
    const { data, error } = await supabase.functions.invoke('storj-operations', {
      body: {
        operation: 'upload',
        filePath,
        fileData: base64,
        contentType: file.type,
        size: file.size,
        ...(bucket && { bucket }),
      },
    });

    if (onProgress) onProgress(100); // Upload complete
    
    if (error) throw error;
    if (!data?.success) throw new Error('Upload failed');
  },

  async downloadFile(filePath: string, onProgress?: (progress: number) => void, bucket?: string): Promise<Blob> {
    // Get a short-lived pre-signed URL from the edge function and stream it client-side
    const { data, error } = await supabase.functions.invoke('storj-operations', {
      body: {
        operation: 'get-download-url',
        filePath,
        ...(bucket && { bucket }),
      },
    });

    if (error) throw error;
    if (!data?.success || !data?.url) throw new Error('Failed to get download URL');

    const res = await fetch(data.url);
    if (!res.ok) throw new Error('Failed to fetch file');

    const total = Number(res.headers.get('Content-Length')) || 0;
    const contentType = res.headers.get('Content-Type') || 'application/octet-stream';

    if (!res.body) {
      // Fallback when streams are not available
      const blob = await res.blob();
      if (onProgress) onProgress(100);
      return blob;
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (onProgress && total) {
          onProgress(Math.min(99, Math.floor((received / total) * 100)));
        }
      }
    }

    // Merge chunks to a single ArrayBuffer to satisfy strict TS DOM typings
    const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }

    const blob = new Blob([merged.buffer], { type: contentType });
    if (onProgress) onProgress(100);
    return blob;
  },

  async deleteFile(filePath: string, bucket?: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('storj-operations', {
      body: {
        operation: 'delete',
        filePath,
        ...(bucket && { bucket }),
      },
    });

    if (error) throw error;
    if (!data?.success) throw new Error('Delete failed');
  },

  async deleteFiles(filePaths: string[], bucket?: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('storj-operations', {
      body: {
        operation: 'delete-multiple',
        files: filePaths,
        ...(bucket && { bucket }),
      },
    });

    if (error) throw error;
    if (!data?.success) throw new Error('Delete failed');
  },

  async getDownloadUrl(filePath: string, bucket?: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('storj-operations', {
      body: { 
        operation: 'get-download-url', 
        filePath,
        ...(bucket && { bucket }),
      },
    });
    if (error) throw error;
    if (!data?.success || !data?.url) throw new Error('Failed to get download URL');
    return data.url as string;
  },
};