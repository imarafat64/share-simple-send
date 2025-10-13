-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a cron job that runs daily at 2 AM UTC to cleanup expired files
-- This will call the cleanup-expired-files edge function
SELECT cron.schedule(
  'cleanup-expired-files-daily',
  '0 2 * * *', -- Run at 2 AM every day
  $$
  SELECT
    net.http_post(
        url:='https://bohvzdjyftonkemuvaic.supabase.co/functions/v1/cleanup-expired-files',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvaHZ6ZGp5ZnRvbmtlbXV2YWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwNjI2MTAsImV4cCI6MjA3MjYzODYxMH0.Wd5MrZsFKce_wwuPYAxcDqbMvOiA7xkcH5LgudOY_24"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Create an index on expires_at for better query performance
CREATE INDEX IF NOT EXISTS idx_files_expires_at ON public.files(expires_at) WHERE expires_at IS NOT NULL;

-- Log the cron job setup
COMMENT ON EXTENSION pg_cron IS 'Cron job scheduler for automatic file cleanup';
