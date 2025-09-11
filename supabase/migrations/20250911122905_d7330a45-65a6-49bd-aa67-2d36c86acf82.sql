-- Add batch_id column to files table to group files uploaded together
ALTER TABLE files ADD COLUMN batch_id uuid DEFAULT NULL;

-- Create index for better performance when querying by batch_id
CREATE INDEX idx_files_batch_id ON files(batch_id);

-- Create function to generate batch_id for multiple file uploads
CREATE OR REPLACE FUNCTION generate_batch_id() RETURNS uuid AS $$
BEGIN
  RETURN gen_random_uuid();
END;
$$ LANGUAGE plpgsql;