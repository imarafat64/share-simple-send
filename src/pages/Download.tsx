import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { storjService } from '@/lib/storj';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Download as DownloadIcon, FileIcon, Home, Package, Lock, AlertCircle, Shield } from 'lucide-react';
import JSZip from 'jszip';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { motion } from 'framer-motion';

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
  user_id: string;
}

const Download = () => {
  const { fileId, batchId } = useParams();
  const [file, setFile] = useState<FileData | null>(null);
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [uploaderPlan, setUploaderPlan] = useState<'free' | 'pro'>('free');
  const isBatch = !!batchId;

  useEffect(() => {
    if (isBatch && batchId) {
      loadBatch();
    } else if (fileId) {
      loadFile();
    }
  }, [fileId, batchId]);

  const checkUploaderPlan = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('plan_type')
        .eq('user_id', userId)
        .single();

      if (!error && data && (data.plan_type === 'free' || data.plan_type === 'pro')) {
        setUploaderPlan(data.plan_type);
      }
    } catch (error) {
      console.error('Error checking uploader plan:', error);
    }
  };

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
        if (data.expires_at && new Date(data.expires_at) < new Date()) {
          setNotFound(true);
          await supabase.from('files').delete().eq('id', fileId);
        } else {
          setFile(data);
          setRequiresPassword(!!data.password_hash);
          await checkUploaderPlan(data.user_id);
        }
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
        const validFiles = data.filter(file => !file.expires_at || new Date(file.expires_at) >= new Date());
        
        if (validFiles.length === 0) {
          setNotFound(true);
          await supabase.from('files').delete().eq('batch_id', batchId);
        } else {
          setFiles(validFiles);
          setRequiresPassword(validFiles.some(f => f.password_hash));
          await checkUploaderPlan(validFiles[0].user_id);
        }
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

  const verifyPassword = (fileData: FileData) => {
    if (!fileData.password_hash) return true;
    return btoa(password) === fileData.password_hash;
  };

  const handleDownload = async () => {
    if (!file) return;

    if (requiresPassword && !verifyPassword(file)) {
      setPasswordError(true);
      toast({
        title: "Incorrect password",
        description: "Please enter the correct password",
        variant: "destructive"
      });
      return;
    }

    setDownloading(true);
    setDownloadProgress(0);
    
    try {
      const data = await storjService.downloadFile(file.storage_path, (progress) => {
        setDownloadProgress(progress);
      });

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      try {
        const url = await storjService.getDownloadUrl(file.storage_path);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (fallbackErr) {
        toast({
          title: "Download failed",
          description: "Failed to download file",
          variant: "destructive"
        });
        return;
      }
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }

    try {
      await supabase
        .from('files')
        .update({ download_count: file.download_count + 1 })
        .eq('id', file.id);
      toast({
        title: "Download complete",
        description: "Your file has been downloaded"
      });
      await loadFile();
    } catch {}
  };

  const handleBatchDownload = async () => {
    if (files.length === 0) return;

    if (requiresPassword) {
      const allValid = files.every(f => verifyPassword(f));
      if (!allValid) {
        setPasswordError(true);
        toast({
          title: "Incorrect password",
          description: "Please enter the correct password",
          variant: "destructive"
        });
        return;
      }
    }

    setDownloading(true);
    setDownloadProgress(0);
    
    try {
      const zip = new JSZip();
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileProgress = Math.floor((i / files.length) * 80);
        setDownloadProgress(fileProgress);
        
        const data = await storjService.downloadFile(file.storage_path, (progress) => {
          const overallProgress = fileProgress + Math.floor((progress / 100) * (80 / files.length));
          setDownloadProgress(overallProgress);
        });
        zip.file(file.filename, data);
      }

      setDownloadProgress(85);
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      setDownloadProgress(95);
      
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `files_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      for (const file of files) {
        await supabase
          .from('files')
          .update({ download_count: file.download_count + 1 })
          .eq('id', file.id);
      }

      setDownloadProgress(100);

      toast({
        title: "Download complete",
        description: `Downloaded ${files.length} files as ZIP archive`
      });

      await loadBatch();
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download files",
        variant: "destructive"
      });
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
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
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-lg text-muted-foreground">Loading file...</div>
        </motion.div>
      </div>
    );
  }

  if (notFound || (!file && !isBatch) || (isBatch && files.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="glass w-full max-w-md">
            <CardHeader className="text-center">
              <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-destructive mx-auto mb-4" />
              <CardTitle className="text-lg sm:text-xl text-destructive">
                {isBatch ? "Batch Not Found" : "File Not Found"}
              </CardTitle>
              <CardDescription className="text-sm">
                {isBatch 
                  ? "The file batch you're looking for doesn't exist, has been removed, or has expired."
                  : "The file you're looking for doesn't exist, has been removed, or has expired."
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => window.location.href = '/'}
                className="w-full bg-gradient-to-r from-primary to-amber-400"
              >
                <Home className="w-4 h-4 mr-2" />
                Go to Homepage
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        {uploaderPlan === 'free' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Alert className="glass border-primary/20">
              <AlertCircle className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                Free plan files expire in 7 days. 
                <a href="/pricing" className="underline ml-1 text-primary hover:text-primary/80">Upgrade to Pro</a> for 30-day retention!
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.href = '/'}
            className="border-primary/20 hover:border-primary/40 hover:bg-primary/10"
          >
            <Home className="w-4 h-4 mr-2" />
            Create Account to Share Files
          </Button>
        </motion.div>
        
        {isBatch ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="glass border-primary/20">
              <CardHeader className="text-center">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className="flex justify-center mb-4"
                >
                  <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
                    <Package className="w-12 h-12 text-primary" />
                  </div>
                </motion.div>
                {requiresPassword && (
                  <div className="flex items-center justify-center gap-2 text-primary mb-2">
                    <Lock className="w-5 h-5" />
                    <span className="text-sm font-medium">Password Protected</span>
                  </div>
                )}
                <CardTitle className="text-lg sm:text-xl">{files.length} Files</CardTitle>
                <CardDescription>
                  {formatFileSize(files.reduce((sum, f) => sum + f.size, 0))} • 
                  Uploaded {formatDate(files[0]?.upload_date)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {requiresPassword && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Enter Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setPasswordError(false);
                      }}
                      placeholder="Enter password to download"
                      className={passwordError ? 'border-destructive' : 'border-primary/20 focus:border-primary'}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    Files in this batch:
                  </h4>
                  <div className="max-h-32 overflow-y-auto space-y-1 p-3 rounded-lg bg-card/50 border border-border">
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
                
                {downloading && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-2"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Preparing files...</span>
                      <span className="text-primary font-medium">{downloadProgress}%</span>
                    </div>
                    <Progress value={downloadProgress} className="h-2" />
                  </motion.div>
                )}
                
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    onClick={handleBatchDownload} 
                    disabled={downloading || (requiresPassword && !password)}
                    className="w-full glow-button bg-gradient-to-r from-primary to-amber-400 hover:from-primary/90 hover:to-amber-400/90"
                    size="lg"
                  >
                    <DownloadIcon className="w-4 h-4 mr-2" />
                    {downloading ? `Creating ZIP ${downloadProgress}%` : 'Download All Files'}
                  </Button>
                </motion.div>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="glass border-primary/20">
              <CardHeader className="text-center">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className="flex justify-center mb-4"
                >
                  <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
                    <FileIcon className="w-12 h-12 text-primary" />
                  </div>
                </motion.div>
                {requiresPassword && (
                  <div className="flex items-center justify-center gap-2 text-primary mb-2">
                    <Lock className="w-5 h-5" />
                    <span className="text-sm font-medium">Password Protected</span>
                  </div>
                )}
                <CardTitle className="text-lg sm:text-xl break-words">{file?.filename}</CardTitle>
                <CardDescription>
                  {file && formatFileSize(file.size)} • Uploaded {file && formatDate(file.upload_date)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {requiresPassword && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Enter Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setPasswordError(false);
                      }}
                      placeholder="Enter password to download"
                      className={passwordError ? 'border-destructive' : 'border-primary/20 focus:border-primary'}
                    />
                  </div>
                )}

                <div className="text-center p-4 rounded-lg bg-card/50 border border-border">
                  <div className="text-sm text-muted-foreground mb-1">Download Count</div>
                  <div className="text-2xl font-bold text-primary">{file?.download_count}</div>
                </div>
                
                {downloading && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-2"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Downloading...</span>
                      <span className="text-primary font-medium">{downloadProgress}%</span>
                    </div>
                    <Progress value={downloadProgress} className="h-2" />
                  </motion.div>
                )}
                
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    onClick={handleDownload} 
                    disabled={downloading || (requiresPassword && !password)}
                    className="w-full glow-button bg-gradient-to-r from-primary to-amber-400 hover:from-primary/90 hover:to-amber-400/90"
                    size="lg"
                  >
                    <DownloadIcon className="w-4 h-4 mr-2" />
                    {downloading ? `Downloading ${downloadProgress}%` : 'Download File'}
                  </Button>
                </motion.div>

                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
                  <Shield className="w-3 h-3" />
                  <span>This link is secured and authenticated</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Download;
