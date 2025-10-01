import { supabase } from '@/integrations/supabase/client';

// Storj service that uses edge function
export const storjService = {
  async uploadFile(file: File, filePath: string, onProgress?: (progress: number) => void): Promise<void> {
    // Convert file to base64 for transmission in chunks to avoid stack overflow
    const buffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    
    // Convert to base64 in chunks to avoid maximum call stack size exceeded
    let binaryString = '';
    const chunkSize = 1024; // Process 1KB at a time
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binaryString += String.fromCharCode(...chunk);
      
      // Report progress during base64 conversion (0-50%)
      if (onProgress) {
        const progress = Math.floor((i / uint8Array.length) * 50);
        onProgress(progress);
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
      },
    });

    if (onProgress) onProgress(100); // Upload complete
    
    if (error) throw error;
    if (!data?.success) throw new Error('Upload failed');
  },

  async downloadFile(filePath: string, onProgress?: (progress: number) => void): Promise<Blob> {
    if (onProgress) onProgress(10);
    const { data, error } = await supabase.functions.invoke('storj-operations', {
      body: {
        operation: 'download',
        filePath,
      },
    });

    if (onProgress) onProgress(50);
    
    if (error) throw error;
    if (!data?.success) throw new Error('Download failed');
    
    // Convert base64 back to blob
    const binaryString = atob(data.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
      
      // Report progress during conversion (50-100%)
      if (onProgress && i % 10000 === 0) {
        const progress = 50 + Math.floor((i / binaryString.length) * 50);
        onProgress(progress);
      }
    }
    
    if (onProgress) onProgress(100);
    
    return new Blob([bytes], { type: data.contentType });
  },

  async deleteFile(filePath: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('storj-operations', {
      body: {
        operation: 'delete',
        filePath,
      },
    });

    if (error) throw error;
    if (!data?.success) throw new Error('Delete failed');
  },

  async deleteFiles(filePaths: string[]): Promise<void> {
    const { data, error } = await supabase.functions.invoke('storj-operations', {
      body: {
        operation: 'delete-multiple',
        files: filePaths,
      },
    });

    if (error) throw error;
    if (!data?.success) throw new Error('Delete failed');
  },
};