import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { User } from '@supabase/supabase-js';
import { Upload, Download, Copy, LogOut, Share, Trash2, Home } from 'lucide-react';
import { Input } from '@/components/ui/input';

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

interface FileBatch {
  batch_id: string;
  files: FileData[];
  total_size: number;
  upload_date: string;
}

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string>('');
  const [files, setFiles] = useState<FileData[]>([]);
  const [fileBatches, setFileBatches] = useState<FileBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate('/auth');
        return;
      }
      setUser(session.user);
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session?.user) {
          navigate('/auth');
        } else {
          setUser(session.user);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (user) {
      loadFiles();
      loadUsername();
    }
  }, [user]);

  const loadUsername = async () => {
    try {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setUsername(data?.username || '');
    } catch (error) {
      // Fallback to email username if profile not found
      setUsername(user?.email?.split('@')[0] || '');
    }
  };

  const loadFiles = async () => {
    try {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', user.id)
        .order('upload_date', { ascending: false });

      if (error) throw error;
      setFiles(data || []);

      // Group files by batch_id
      const batchMap = new Map<string, FileData[]>();
      const singleFiles: FileData[] = [];

      (data || []).forEach(file => {
        if (file.batch_id) {
          if (!batchMap.has(file.batch_id)) {
            batchMap.set(file.batch_id, []);
          }
          batchMap.get(file.batch_id)!.push(file);
        } else {
          singleFiles.push(file);
        }
      });

      const batches: FileBatch[] = Array.from(batchMap.entries()).map(([batch_id, files]) => ({
        batch_id,
        files,
        total_size: files.reduce((sum, file) => sum + file.size, 0),
        upload_date: files[0].upload_date
      }));

      // Add single files as individual batches
      singleFiles.forEach(file => {
        batches.push({
          batch_id: file.id,
          files: [file],
          total_size: file.size,
          upload_date: file.upload_date
        });
      });

      setFileBatches(batches.sort((a, b) => new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime()));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load files",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user) return;

    setUploading(true);
    try {
      // Generate batch_id for multiple files
      const batchId = files.length > 1 ? crypto.randomUUID() : null;

      const uploadPromises = Array.from(files).map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        // Upload file to storage
        const { error: uploadError } = await supabase.storage
          .from('files')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Save file metadata to database
        const { error: dbError } = await supabase
          .from('files')
          .insert({
            user_id: user.id,
            filename: file.name,
            size: file.size,
            storage_path: filePath,
            mimetype: file.type,
            batch_id: batchId
          });

        if (dbError) throw dbError;
        return file.name;
      });

      const uploadedFiles = await Promise.all(uploadPromises);

      toast({
        title: "Success",
        description: `${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''} uploaded successfully!`
      });

      await loadFiles();
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload one or more files",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const copyShareLink = (batchId: string, isBatch: boolean = false) => {
    const shareUrl = isBatch ? 
      `${window.location.origin}/download/batch/${batchId}` : 
      `${window.location.origin}/download/${batchId}`;
    navigator.clipboard.writeText(shareUrl);
    toast({
      title: "Link copied",
      description: "Share link copied to clipboard!"
    });
  };

  const deleteFileBatch = async (batch: FileBatch) => {
    try {
      // Delete all files in the batch from storage
      const storagePaths = batch.files.map(file => file.storage_path);
      const { error: storageError } = await supabase.storage
        .from('files')
        .remove(storagePaths);

      if (storageError) throw storageError;

      // Delete all files in the batch from database
      const fileIds = batch.files.map(file => file.id);
      const { error: dbError } = await supabase
        .from('files')
        .delete()
        .in('id', fileIds);

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: `${batch.files.length} file${batch.files.length > 1 ? 's' : ''} deleted successfully!`
      });

      await loadFiles();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: "Failed to delete files",
        variant: "destructive"
      });
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
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 text-xl sm:text-2xl font-bold text-foreground hover:text-primary transition-colors">
              <Home className="w-5 h-5 sm:w-6 sm:h-6" />
              Shyfto Dashboard
            </Link>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <span className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-none">
              {username || user?.email?.split('@')[0]}
            </span>
            <Button variant="outline" onClick={handleSignOut} size="sm" className="w-full sm:w-auto">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Upload className="w-5 h-5" />
                Upload File
              </CardTitle>
              <CardDescription className="text-sm">
                Upload one or multiple files to share with others
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-4">
                <Input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="cursor-pointer text-sm"
                />
                {uploading && (
                  <div className="text-sm text-muted-foreground">
                    Uploading file...
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg sm:text-xl font-semibold">Your Files</h2>
          
          {fileBatches.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8 sm:py-12">
                <div className="text-muted-foreground text-sm sm:text-base">
                  No files uploaded yet. Upload your first file to get started!
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {fileBatches.map((batch) => (
                <Card key={batch.batch_id}>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {batch.files.length === 1 ? (
                          <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">
                            {batch.files[0].filename}
                          </h3>
                        ) : (
                          <div>
                            <h3 className="font-semibold text-foreground text-sm sm:text-base">
                              {batch.files.length} files uploaded together
                            </h3>
                            <div className="text-xs text-muted-foreground mt-1 space-y-1">
                              {batch.files.map((file, index) => (
                                <div key={file.id} className="truncate">
                                  {index + 1}. {file.filename}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="text-xs sm:text-sm text-muted-foreground mt-2 space-y-1 sm:space-y-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <span>{formatFileSize(batch.total_size)}</span>
                            <span className="hidden sm:inline">•</span>
                            <span>Uploaded {formatDate(batch.upload_date)}</span>
                            <span className="hidden sm:inline">•</span>
                            <span>{batch.files.reduce((sum, file) => sum + file.download_count, 0)} downloads</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyShareLink(batch.batch_id, batch.files.length > 1)}
                          className="text-xs sm:text-sm"
                        >
                          <Copy className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                          Copy Link
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteFileBatch(batch)}
                          className="text-xs sm:text-sm"
                        >
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;