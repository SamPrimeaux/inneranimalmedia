
import { Ai } from '@cloudflare/ai';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API Routes
    if (url.pathname.startsWith('/api/')) {
      
      // AI Chat Endpoint
      if (url.pathname === '/api/chat' && request.method === 'POST') {
        try {
          const { message, context } = await request.json();
          const ai = new Ai(env.AI);

          const systemPrompt = `You are Sam, an AI agent for InnerAnimal Media. 
          You are helpful, professional, and focused on software engineering and cloud architecture.
          You can help plan, build, and ship projects.
          Do NOT execute any destructive commands.
          Do NOT reveal sensitive internal information.
          Keep responses concise and relevant to the user's project context.`;

          const messages = [
            { role: 'system', content: systemPrompt },
            ...(context || []), // Previous context if any
            { role: 'user', content: message }
          ];

          const response = await ai.run('@cf/meta/llama-3-8b-instruct', { messages });

          return new Response(JSON.stringify({ response: response.response }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
      }

      // Database Endpoint (Example: List Projects)
      if (url.pathname === '/api/projects' && request.method === 'GET') {
        try {
          // Safe read-only query
          const { results } = await env.DB.prepare('SELECT * FROM projects LIMIT 10').all();
          return new Response(JSON.stringify(results), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
           // If table doesn't exist or other error, return empty list or error safely
           console.error(error);
           return new Response(JSON.stringify({ projects: [] }), { 
             headers: { 'Content-Type': 'application/json' } 
           });
        }
      }

      // R2 Endpoints
      if (url.pathname.startsWith('/api/files')) {
        // List Files
        if (request.method === 'GET' && url.pathname === '/api/files') {
          try {
            const list = await env.BUCKET.list();
            return new Response(JSON.stringify(list), {
              headers: { 'Content-Type': 'application/json' }
            });
          } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
          }
        }

        // Get File Content (Proxy)
        // Usage: /api/files/filename.ext
        const key = url.pathname.replace('/api/files/', '');
        if (key && request.method === 'GET') {
          try {
            const object = await env.BUCKET.get(key);
            if (!object) {
              return new Response('File not found', { status: 404 });
            }
            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set('etag', object.httpEtag);
            return new Response(object.body, { headers });
          } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
          }
        }
        
        // Upload File (Deploy)
        if (key && request.method === 'PUT') {
           try {
             await env.BUCKET.put(key, request.body);
             return new Response(JSON.stringify({ success: true, key }), {
               headers: { 'Content-Type': 'application/json' }
             });
           } catch (error) {
             return new Response(JSON.stringify({ error: error.message }), { status: 500 });
           }
        }
      }

      return new Response('Not Found', { status: 404 });
    }

    // Serve Static Assets (default behavior for non-API routes)
    // When using 'assets' binding in wrangler.jsonc, the worker can fall through to assets
    // But for explicit asset serving in module workers, we often rely on the platform to handle it if we don't return a response.
    // However, with `assets` configuration, requests not handled by the worker (returning a Response) *should* fall through.
    // Let's explicitly try to fetch from assets if available, or just return 404 if not found in API.
    // Actually, for Workers with Assets, if we return `fetch(request)` it might loop if not careful, 
    // but typically we just let the worker handle API and return `env.ASSETS.fetch(request)` for everything else.
    
    if (env.ASSETS) {
      let response = await env.ASSETS.fetch(request);
      
      // If 404, try appending .html for extensionless URLs
      if (response.status === 404 && !url.pathname.includes('.')) {
        const htmlUrl = new URL(request.url);
        htmlUrl.pathname += '.html';
        const htmlResponse = await env.ASSETS.fetch(htmlUrl);
        if (htmlResponse.status === 200) {
          response = htmlResponse;
        }
      }

      const newHeaders = new Headers(response.headers);
      newHeaders.set("X-Worker-Debug", "Active");
      newHeaders.set("Cache-Control", "no-cache"); // Temporarily disable cache to debug
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
};
