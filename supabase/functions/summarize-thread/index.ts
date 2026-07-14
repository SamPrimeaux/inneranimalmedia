/**
 * Supabase Edge Function: summarize-thread
 * Retired — Worker owns R2 → memory summarization.
 * POST /api/internal/summarize-session on the main Worker.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((_req: Request) => {
  return new Response(
    JSON.stringify({
      ok: false,
      error: "gone",
      message:
        "summarize-thread is retired. Use Worker POST /api/internal/summarize-session (R2 messages.jsonl → agentsam_memory + memory_oai3large_1536).",
    }),
    {
      status: 410,
      headers: { "Content-Type": "application/json" },
    },
  );
});
