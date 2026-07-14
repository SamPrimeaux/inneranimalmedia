/**
 * Supabase Edge Function: embed-on-ingest
 * text-embedding-3-large @ 1536 (hot lanes) or 3072 (deep_archive).
 * verify_jwt: true — callers use service role Bearer.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MODEL = "text-embedding-3-large";

type Body = {
  table?: string;
  id?: string;
  content?: string;
  dimensions?: number;
  workspace_id?: string;
  source_ref?: string;
  source_type?: string;
  title?: string;
  memory_key?: string;
  metadata?: Record<string, unknown>;
};

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
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
  }

  const content = String(body.content || "").trim();
  if (!content) {
    return new Response(JSON.stringify({ error: "content_required" }), { status: 400 });
  }

  const dims = Number(body.dimensions) === 3072 ? 3072 : 1536;
  const table =
    String(body.table || "").trim() ||
    (dims === 3072 ? "agentsam_deep_archive_oai3large_3072" : "agentsam_memory_oai3large_1536");

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
  if (!embRes.ok) {
    return new Response(
      JSON.stringify({ error: embJson?.error?.message || `openai_${embRes.status}` }),
      { status: 502 },
    );
  }
  const embedding = embJson?.data?.[0]?.embedding as number[] | undefined;
  if (!Array.isArray(embedding) || embedding.length !== dims) {
    return new Response(
      JSON.stringify({ error: "bad_embedding_dims", got: embedding?.length ?? 0, expected: dims }),
      { status: 502 },
    );
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    db: { schema: "agentsam" },
    auth: { persistSession: false },
  });

  const id = String(body.id || crypto.randomUUID());
  const vector = `[${embedding.join(",")}]`;
  const contentHash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (dims === 3072) {
    if (!body.workspace_id) {
      return new Response(JSON.stringify({ error: "workspace_id_required" }), { status: 400 });
    }
    const row = {
      id,
      workspace_id: body.workspace_id,
      title: body.title || body.source_ref || id,
      content,
      content_hash: contentHash,
      source_type: body.source_type || "deep_archive",
      archive_tier: "standard",
      source_ref: body.source_ref || id,
      embedding: vector,
      embedding_model: MODEL,
      embedding_dims: 3072,
      embedded_at: new Date().toISOString(),
      metadata: body.metadata || {},
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from(table).upsert(row as never, { onConflict: "workspace_id,source_ref" });
    if (error) {
      return new Response(JSON.stringify({ error: error.message, table }), { status: 500 });
    }
  } else {
    const memoryKey = String(body.memory_key || body.source_ref || id).trim();
    const row = {
      id,
      workspace_id: body.workspace_id || null,
      user_id: null,
      memory_key: memoryKey,
      title: body.title || memoryKey,
      content,
      embedding: vector,
      source: body.source_type || "embed_on_ingest",
      metadata: { ...(body.metadata || {}), source_type: body.source_type || "embed_on_ingest" },
      embedded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    const { error } = await sb.from(table).upsert(row as never);
    if (error) {
      return new Response(JSON.stringify({ error: error.message, table }), { status: 500 });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, id, table, dimensions: dims, model: MODEL }),
    { headers: { "Content-Type": "application/json" } },
  );
});
