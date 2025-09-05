import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Download as DownloadIcon, FileIcon } from 'lucide-react';

interface FileData {
  id: string;
  filename: string;
  size: number;
  upload_date: string;
  download_count: number;
  storage_path: string;
  mimetype: string;
}

const Download = () => {
  const { fileId } = useParams();
  const [file, setFile] = useState<FileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (fileId) {
      loadFile();
    }
  }, [fileId]);

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

  if (notFound || !file) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-destructive">File Not Found</CardTitle>
            <CardDescription>
              The file you're looking for doesn't exist or has been removed.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <FileIcon className="w-16 h-16 text-primary" />
          </div>
          <CardTitle className="text-xl">{file.filename}</CardTitle>
          <CardDescription>
            {formatFileSize(file.size)} • Uploaded {formatDate(file.upload_date)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            Downloaded {file.download_count} times
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
          
          <div className="text-center">
            <a 
              href="/auth" 
              className="text-sm text-primary hover:underline"
            >
              Create your own account to upload files
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Download;