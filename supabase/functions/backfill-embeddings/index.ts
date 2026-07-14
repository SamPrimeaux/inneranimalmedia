/**
 * Supabase Edge Function: backfill-embeddings
 * Batches missing embeddings on agentsam hot lanes (1536) or deep archive (3072).
 * verify_jwt: true.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MODEL = "text-embedding-3-large";

type Body = {
  table?: string;
  dimensions?: number;
  limit?: number;
  workspace_id?: string;
};

async function embed(openaiKey: string, content: string, dims: number): Promise<number[]> {
  const embRes = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: content.slice(0, 24000),
      dimensions: dims,
    }),
  });
  const embJson = await embRes.json();
  if (!embRes.ok) throw new Error(embJson?.error?.message || `openai_${embRes.status}`);
  const embedding = embJson?.data?.[0]?.embedding as number[] | undefined;
  if (!Array.isArray(embedding) || embedding.length !== dims) {
    throw new Error(`bad_embedding_dims:${embedding?.length ?? 0}`);
  }
  return embedding;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!openaiKey || !supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "missing_secrets" }), { status: 500 });
  }

  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const dims = Number(body.dimensions) === 3072 ? 3072 : 1536;
  const table =
    String(body.table || "").trim() ||
    (dims === 3072 ? "agentsam_deep_archive_oai3large_3072" : "agentsam_memory_oai3large_1536");
  const limit = Math.min(40, Math.max(1, Number(body.limit) || 10));

  const sb = createClient(supabaseUrl, serviceKey, {
    db: { schema: "agentsam" },
    auth: { persistSession: false },
  });

  let query = sb
    .from(table)
    .select("id, content")
    .is("embedding", null)
    .not("content", "is", null)
    .limit(limit);

  if (body.workspace_id) {
    query = query.eq("workspace_id", body.workspace_id);
  }

  const { data, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message, table }), { status: 500 });
  }

  const rows = Array.isArray(data) ? data : [];
  let updated = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const row of rows) {
    const id = String((row as { id?: string }).id || "");
    const content = String((row as { content?: string }).content || "").trim();
    if (!id || !content) continue;
    try {
      const embedding = await embed(openaiKey, content, dims);
      const patch: Record<string, unknown> = {
        embedding: `[${embedding.join(",")}]`,
        embedded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (dims === 3072) {
        patch.embedding_model = MODEL;
        patch.embedding_dims = 3072;
      }
      const { error: updErr } = await sb.from(table).update(patch as never).eq("id", id);
      if (updErr) throw new Error(updErr.message);
      updated += 1;
    } catch (e) {
      errors.push({ id, error: String((e as Error)?.message || e) });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      table,
      dimensions: dims,
      model: MODEL,
      scanned: rows.length,
      updated,
      errors: errors.slice(0, 10),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
