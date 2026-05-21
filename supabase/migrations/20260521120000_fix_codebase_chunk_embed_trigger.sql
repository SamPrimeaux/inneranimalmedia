-- Fix notify_codebase_chunk_embed: webhook_secrets has vault_secret_id, not secret.
-- Embedding forward path: codebase_chunks_embed trigger → embed-on-ingest (see DATABASE_WEBHOOKS_SETUP.md).

CREATE OR REPLACE FUNCTION public.notify_codebase_chunk_embed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;
