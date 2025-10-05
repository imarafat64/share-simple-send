import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { storjService } from '@/lib/storj';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { User } from '@supabase/supabase-js';
import { Upload, Copy, LogOut, Home, Trash2, Crown, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { useSubscription } from '@/hooks/useSubscription';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface FileData {
  id: string;
  filename: string;
  size: number;
  upload_date: string;
  download_count: number;
  storage_path: string;
  mimetype: string;
  batch_id?: string;
  password_hash?: string;
  expires_at?: string;
}

interface FileBatch {
  batch_id: string;
  files: FileData[];
  total_size: number;
  upload_date: string;
  has_password: boolean;
}

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string>('');
  const [files, setFiles] = useState<FileData[]>([]);
  const [fileBatches, setFileBatches] = useState<FileBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [storageUsed, setStorageUsed] = useState(0);
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState<string>('');
  const [filePassword, setFilePassword] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { planType, limits, loading: subLoading, checkSubscription, manageSubscription } = useSubscription();

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
      calculateStorage();
    }
  }, [user]);

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast({
        title: 'Success!',
        description: 'Your Pro subscription is now active!',
      });
      checkSubscription();
    }
  }, [searchParams]);

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
      setUsername(user?.email?.split('@')[0] || '');
    }
  };

  const calculateStorage = async () => {
    try {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('files')
        .select('size')
        .eq('user_id', user.id);

      if (error) throw error;
      const total = data.reduce((sum, file) => sum + file.size, 0);
      setStorageUsed(total);
    } catch (error) {
      console.error('Error calculating storage:', error);
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
        upload_date: files[0].upload_date,
        has_password: files.some(f => f.password_hash)
      }));

      singleFiles.forEach(file => {
        batches.push({
          batch_id: file.id,
          files: [file],
          total_size: file.size,
          upload_date: file.upload_date,
          has_password: !!file.password_hash
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, password?: string) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0 || !user) return;

    // Check plan limits
    const totalSize = Array.from(selectedFiles).reduce((sum, file) => sum + file.size, 0);
    
    if (storageUsed + totalSize > limits.maxStorage) {
      toast({
        title: "Storage limit exceeded",
        description: `You need ${formatFileSize(storageUsed + totalSize - limits.maxStorage)} more storage. Upgrade to Pro for 100 GB!`,
        variant: "destructive"
      });
      event.target.value = '';
      return;
    }

    for (const file of Array.from(selectedFiles)) {
      if (file.size > limits.maxFileSize) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds the ${formatFileSize(limits.maxFileSize)} limit for ${planType} plan`,
          variant: "destructive"
        });
        event.target.value = '';
        return;
      }
    }

    setUploading(true);
    setUploadProgress({});
    
    try {
      const batchId = selectedFiles.length > 1 ? crypto.randomUUID() : null;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + limits.retentionDays);

      const uploadPromises = Array.from(selectedFiles).map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        await storjService.uploadFile(file, filePath, (progress) => {
          setUploadProgress(prev => ({
            ...prev,
            [file.name]: progress
          }));
        });

        const fileData: any = {
          user_id: user.id,
          filename: file.name,
          size: file.size,
          storage_path: filePath,
          mimetype: file.type,
          batch_id: batchId,
          expires_at: expiresAt.toISOString()
        };

        if (password) {
          fileData.password_hash = btoa(password);
        }

        const { error: dbError } = await supabase
          .from('files')
          .insert(fileData);

        if (dbError) throw dbError;
        return file.name;
      });

      await Promise.all(uploadPromises);

      toast({
        title: "Success",
        description: `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} uploaded successfully!`
      });

      await loadFiles();
      await calculateStorage();
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload one or more files",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      setUploadProgress({});
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

  const openPasswordDialog = (batchId: string) => {
    setCurrentBatchId(batchId);
    setFilePassword('');
    setPasswordDialog(true);
  };

  const handlePasswordProtectedUpload = async () => {
    const input = document.getElementById('file-upload-password') as HTMLInputElement;
    if (input?.files && filePassword) {
      setPasswordDialog(false);
      await handleFileUpload({ target: input } as any, filePassword);
    }
  };

  const deleteFileBatch = async (batch: FileBatch) => {
    try {
      const storagePaths = batch.files.map(file => file.storage_path);
      await storjService.deleteFiles(storagePaths);

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
      await calculateStorage();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: "Failed to delete files",
        variant: "destructive"
      });
    }
  };

  const deleteSingleFile = async (file: FileData) => {
    try {
      await storjService.deleteFile(file.storage_path);
      const { error: dbError } = await supabase
        .from('files')
        .delete()
        .eq('id', file.id);

      if (dbError) throw dbError;

      toast({
        title: 'Success',
        description: `${file.filename} deleted successfully!`
      });

      await loadFiles();
      await calculateStorage();
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete file',
        variant: 'destructive'
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

  const getDaysUntilExpiry = (expiresAt?: string) => {
    if (!expiresAt) return null;
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  if (loading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  const storagePercent = (storageUsed / limits.maxStorage) * 100;

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
            <Badge variant={planType === 'pro' ? 'default' : 'secondary'}>
              {planType === 'pro' ? <Crown className="w-3 h-3 mr-1" /> : null}
              {planType === 'pro' ? 'Pro Plan' : 'Free Plan'}
            </Badge>
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-none">
                {username || user?.email?.split('@')[0]}
              </span>
              <span className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-none">{user?.email}</span>
            </div>
            {planType === 'pro' && (
              <Button variant="outline" onClick={manageSubscription} size="sm">
                Manage
              </Button>
            )}
            <Button variant="outline" onClick={handleSignOut} size="sm" className="w-full sm:w-auto">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8">
        {/* Storage Usage Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Storage Usage</CardTitle>
                <CardDescription>
                  {formatFileSize(storageUsed)} of {formatFileSize(limits.maxStorage)} used
                </CardDescription>
              </div>
              {planType === 'free' && (
                <Button onClick={() => navigate('/pricing')} size="sm">
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade to Pro
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={storagePercent} className="h-2" />
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Max File Size</div>
                <div className="font-semibold">{formatFileSize(limits.maxFileSize)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Retention</div>
                <div className="font-semibold">{limits.retentionDays} days</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upload Card */}
        <div className="mb-6 sm:mb-8">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Upload className="w-5 h-5" />
                Upload Files
              </CardTitle>
              <CardDescription className="text-sm">
                Upload any file type. {planType === 'free' && 'Upgrade to Pro for larger files and password protection!'}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <div className="space-y-2">
                <Input
                  id="file-upload"
                  type="file"
                  multiple
                  onChange={(e) => handleFileUpload(e)}
                  disabled={uploading}
                  className="cursor-pointer text-sm"
                />
              </div>
              
              {limits.hasPasswordProtection && (
                <div className="space-y-2">
                  <Label htmlFor="file-upload-password">Password Protection (Pro)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="file-upload-password"
                      type="file"
                      multiple
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          openPasswordDialog('');
                        }
                      }}
                      disabled={uploading}
                      className="cursor-pointer text-sm"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <Lock className="w-3 h-3 inline mr-1" />
                    Files will require password for download
                  </p>
                </div>
              )}

              {uploading && (
                <div className="space-y-3 mt-4">
                  {Object.entries(uploadProgress).map(([filename, progress]) => (
                    <div key={filename} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground truncate max-w-[70%]">{filename}</span>
                        <span className="text-primary font-medium">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Files List */}
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
              {fileBatches.map((batch) => {
                const daysLeft = getDaysUntilExpiry(batch.files[0]?.expires_at);
                
                return (
                  <Card key={batch.batch_id}>
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {batch.files.length === 1 ? (
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">
                                {batch.files[0].filename}
                              </h3>
                              {batch.has_password && (
                                <Lock className="w-4 h-4 text-primary" />
                              )}
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-foreground text-sm sm:text-base">
                                  {batch.files.length} files uploaded together
                                </h3>
                                {batch.has_password && (
                                  <Lock className="w-4 h-4 text-primary" />
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1 space-y-1">
                                {batch.files.map((file, index) => (
                                  <div key={file.id} className="flex items-center justify-between gap-2">
                                    <div className="truncate">{index + 1}. {file.filename}</div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => deleteSingleFile(file)}
                                      aria-label={`Delete ${file.filename}`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="text-xs sm:text-sm text-muted-foreground mt-2 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{formatFileSize(batch.total_size)}</span>
                              <span>•</span>
                              <span>Uploaded {formatDate(batch.upload_date)}</span>
                              <span>•</span>
                              <span>{batch.files.reduce((sum, file) => sum + file.download_count, 0)} downloads</span>
                              {daysLeft !== null && (
                                <>
                                  <span>•</span>
                                  <span className={daysLeft < 3 ? 'text-destructive font-medium' : ''}>
                                    Expires in {daysLeft} days
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
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
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Dialog open={passwordDialog} onOpenChange={setPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password Protect Files</DialogTitle>
            <DialogDescription>
              Set a password that will be required to download these files
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={filePassword}
                onChange={(e) => setFilePassword(e.target.value)}
                placeholder="Enter a strong password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handlePasswordProtectedUpload} disabled={!filePassword}>
              Upload with Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
