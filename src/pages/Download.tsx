import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Download as DownloadIcon, FileIcon, Home, Package } from 'lucide-react';
import JSZip from 'jszip';

interface FileData {
  id: string;
  filename: string;
  size: number;
  upload_date: string;
  download_count: number;
  storage_path: string;
  mimetype: string;
  batch_id?: string;
}

const Download = () => {
  const { fileId, batchId } = useParams();
  const [file, setFile] = useState<FileData | null>(null);
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const isBatch = !!batchId;

  useEffect(() => {
    if (isBatch && batchId) {
      loadBatch();
    } else if (fileId) {
      loadFile();
    }
  }, [fileId, batchId]);

  const loadFile = async () => {
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('id', fileId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          setNotFound(true);
        } else {
          throw error;
        }
      } else {
        setFile(data);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load file information",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadBatch = async () => {
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('batch_id', batchId)
        .order('filename');

      if (error) throw error;

      if (!data || data.length === 0) {
        setNotFound(true);
      } else {
        setFiles(data);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load batch information",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!file) return;

    setDownloading(true);
    try {
      // Get download URL from storage
      const { data, error } = await supabase.storage
        .from('files')
        .download(file.storage_path);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Update download count
      await supabase
        .from('files')
        .update({ download_count: file.download_count + 1 })
        .eq('id', file.id);

      toast({
        title: "Download started",
        description: "Your file download has started"
      });

      // Refresh file data to show updated download count
      await loadFile();
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download file",
        variant: "destructive"
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleBatchDownload = async () => {
    if (files.length === 0) return;

    setDownloading(true);
    try {
      const zip = new JSZip();
      
      // Download all files and add them to zip
      for (const file of files) {
        const { data, error } = await supabase.storage
          .from('files')
          .download(file.storage_path);

        if (error) throw error;
        zip.file(file.filename, data);
      }

      // Generate zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Create download link for zip
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `files_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Update download count for all files
      for (const file of files) {
        await supabase
          .from('files')
          .update({ download_count: file.download_count + 1 })
          .eq('id', file.id);
      }

      toast({
        title: "Download started",
        description: `Downloading ${files.length} files as ZIP archive`
      });

      // Refresh batch data
      await loadBatch();
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download files",
        variant: "destructive"
      });
    } finally {
      setDownloading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-lg">Loading file...</div>
        </div>
      </div>
    );
  }

  if (notFound || (!file && !isBatch) || (isBatch && files.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-destructive">
              {isBatch ? "Batch Not Found" : "File Not Found"}
            </CardTitle>
            <CardDescription>
              {isBatch 
                ? "The file batch you're looking for doesn't exist or has been removed."
                : "The file you're looking for doesn't exist or has been removed."
              }
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.href = '/'}
            className="flex items-center gap-2"
          >
            <Home className="w-4 h-4" />
            Create Account to Share Files
          </Button>
        </div>
        
        {isBatch ? (
          <Card className="w-full">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <Package className="w-16 h-16 text-primary" />
              </div>
              <CardTitle className="text-xl">{files.length} Files</CardTitle>
              <CardDescription>
                {formatFileSize(files.reduce((sum, f) => sum + f.size, 0))} • 
                Uploaded {formatDate(files[0]?.upload_date)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Files in this batch:</h4>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {files.map((file, index) => (
                    <div key={file.id} className="text-xs text-muted-foreground">
                      {index + 1}. {file.filename} ({formatFileSize(file.size)})
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="text-center text-sm text-muted-foreground">
                Downloaded {files.reduce((sum, f) => sum + f.download_count, 0)} times
              </div>
              
              <Button 
                onClick={handleBatchDownload} 
                disabled={downloading}
                className="w-full"
                size="lg"
              >
                <DownloadIcon className="w-4 h-4 mr-2" />
                {downloading ? 'Creating ZIP...' : 'Download All Files'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="w-full">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <FileIcon className="w-16 h-16 text-primary" />
              </div>
              <CardTitle className="text-xl">{file?.filename}</CardTitle>
              <CardDescription>
                {file && formatFileSize(file.size)} • Uploaded {file && formatDate(file.upload_date)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center text-sm text-muted-foreground">
                Downloaded {file?.download_count} times
              </div>
              
              <Button 
                onClick={handleDownload} 
                disabled={downloading}
                className="w-full"
                size="lg"
              >
                <DownloadIcon className="w-4 h-4 mr-2" />
                {downloading ? 'Downloading...' : 'Download File'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Download;