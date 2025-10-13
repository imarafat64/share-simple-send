import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CLEANUP-EXPIRED-FILES] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Starting cleanup job");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Find all expired files
    const { data: expiredFiles, error: fetchError } = await supabaseClient
      .from('files')
      .select('id, storage_path, filename, user_id, batch_id')
      .lt('expires_at', new Date().toISOString())
      .not('expires_at', 'is', null);

    if (fetchError) {
      logStep("Error fetching expired files", { error: fetchError.message });
      throw fetchError;
    }

    if (!expiredFiles || expiredFiles.length === 0) {
      logStep("No expired files found");
      return new Response(
        JSON.stringify({ success: true, deletedCount: 0, message: "No expired files to delete" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    logStep("Found expired files", { count: expiredFiles.length });

    const deletionResults = {
      successCount: 0,
      failureCount: 0,
      errors: [] as any[],
    };

    // Group files by user for notification purposes
    const filesByUser = expiredFiles.reduce((acc, file) => {
      if (!acc[file.user_id]) {
        acc[file.user_id] = [];
      }
      acc[file.user_id].push(file);
      return acc;
    }, {} as Record<string, typeof expiredFiles>);

    // Process each expired file
    for (const file of expiredFiles) {
      try {
        logStep("Deleting file from Storj", { filename: file.filename, path: file.storage_path });

        // Delete from Storj using the storj-operations function
        const { error: storjError } = await supabaseClient.functions.invoke('storj-operations', {
          body: {
            operation: 'delete',
            filePath: file.storage_path,
          },
        });

        if (storjError) {
          logStep("Error deleting from Storj", { filename: file.filename, error: storjError.message });
          deletionResults.errors.push({ fileId: file.id, error: storjError.message });
          deletionResults.failureCount++;
          continue;
        }

        // Delete from database
        const { error: dbError } = await supabaseClient
          .from('files')
          .delete()
          .eq('id', file.id);

        if (dbError) {
          logStep("Error deleting from database", { filename: file.filename, error: dbError.message });
          deletionResults.errors.push({ fileId: file.id, error: dbError.message });
          deletionResults.failureCount++;
          continue;
        }

        logStep("Successfully deleted file", { filename: file.filename });
        deletionResults.successCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logStep("Unexpected error deleting file", { filename: file.filename, error: errorMessage });
        deletionResults.errors.push({ fileId: file.id, error: errorMessage });
        deletionResults.failureCount++;
      }
    }

    logStep("Cleanup job completed", {
      totalFiles: expiredFiles.length,
      successCount: deletionResults.successCount,
      failureCount: deletionResults.failureCount,
      affectedUsers: Object.keys(filesByUser).length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        deletedCount: deletionResults.successCount,
        failedCount: deletionResults.failureCount,
        totalProcessed: expiredFiles.length,
        affectedUsers: Object.keys(filesByUser).length,
        errors: deletionResults.errors.length > 0 ? deletionResults.errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in cleanup job", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
