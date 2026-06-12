/**
 * Legacy Meaux service routes (preserved from pre-remaster worker).
 */

export async function handleLegacyMeauxRoute(request, env, path, method) {
  if (path === '/.well-known/openid-configuration') {
    const baseUrl = 'https://moviemode.inneranimalmedia.com';
    return Response.json({
      issuer: baseUrl,
      jwks_uri: `${baseUrl}/.well-known/jwks.json`,
      response_types_supported: ['id_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
    });
  }

  if (path === '/.well-known/jwks.json') {
    return Response.json({ keys: [] });
  }

  if (path === '/meauxsafe/audit' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const textToAudit = body.text || '';
    const violations = [];
    if (textToAudit.toLowerCase().includes('orange')) violations.push("Use 'Peach', not 'Orange'.");
    if (textToAudit.includes('Comic Sans')) violations.push('Forbidden font detected.');
    return Response.json({ status: violations.length ? 'FAIL' : 'PASS', violations });
  }

  if (path === '/meauxdoc/generate' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    return Response.json({
      status: 'generated',
      url: 'https://inneranimalmedia.com/assets/docs/invoice_123.pdf',
      message: `Generated contract for ${body.clientName} for $${body.price}`,
    });
  }

  if (path === '/meauxmedia/optimize' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const apiKey = env.CLOUDCONVERT_API_KEY;
    if (!apiKey) {
      return Response.json({
        status: 'optimized (mock)',
        format: 'webp',
        message: 'Add CLOUDCONVERT_API_KEY secret to enable real conversion',
      });
    }
    const job = await fetch('https://api.cloudconvert.com/v2/jobs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tasks: {
          'import-my-file': { operation: 'import/url', url: body.fileUrl },
          'convert-my-file': {
            operation: 'convert',
            input: 'import-my-file',
            output_format: 'webp',
            engine: 'imagemagick',
          },
          'export-my-file': { operation: 'export/url', input: 'convert-my-file' },
        },
      }),
    });
    const jobData = await job.json();
    return Response.json({ status: 'job_started', provider: 'CloudConvert', data: jobData });
  }

  if (path === '/meauxcad/generate' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const apiKey = env.MESHYAI_API_KEY;
    if (!apiKey) return Response.json({ status: 'error', message: 'Meshy.ai API Key missing' }, { status: 500 });
    const meshyRes = await fetch('https://api.meshy.ai/v2/text-to-3d', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: body.prompt,
        mode: 'preview',
        art_style: body.style || 'realistic',
        negative_prompt: 'low quality, blurry, distorted',
      }),
    });
    if (!meshyRes.ok) {
      const err = await meshyRes.text();
      return Response.json({ status: 'error', message: 'Meshy API Failed', details: err }, { status: 502 });
    }
    const data = await meshyRes.json();
    return Response.json({ status: 'queued', taskId: data.result });
  }

  if (path === '/meauxcad/status' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const taskId = body.taskId;
    const apiKey = env.MESHYAI_API_KEY;
    if (!taskId) return Response.json({ error: 'Missing taskId' }, { status: 400 });
    const statusRes = await fetch(`https://api.meshy.ai/v2/text-to-3d/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return Response.json(await statusRes.json());
  }

  if (path === '/meauxgrants/draft' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { orgName, foundationName, mission } = body;
    const prompt = `Write a Letter of Inquiry for ${orgName} to ${foundationName}. Mission: ${mission}`;
    try {
      const aiRes = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [{ role: 'user', content: prompt }],
      });
      return Response.json({ status: 'success', loi_draft: aiRes.response || 'Error generating text.' });
    } catch (e) {
      return Response.json({ status: 'error', message: e.message }, { status: 500 });
    }
  }

  if (path === '/meauxcreate/repurpose' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const apiKey = env.CLOUDCONVERT_API_KEY;
    if (!apiKey) return Response.json({ error: 'Missing CloudConvert Key' }, { status: 500 });
    const ccRes = await fetch('https://api.cloudconvert.com/v2/jobs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tasks: {
          'import-src': { operation: 'import/url', url: body.url },
          'convert-audio': {
            operation: 'convert',
            input: 'import-src',
            output_format: 'mp3',
            engine: 'ffmpeg',
          },
          'export-res': { operation: 'export/url', input: 'convert-audio' },
        },
        tag: 'meauxcreate-repurpose',
      }),
    });
    if (!ccRes.ok) {
      return Response.json({ error: 'CloudConvert Init Failed', details: await ccRes.text() }, { status: 502 });
    }
    const data = await ccRes.json();
    return Response.json({ status: 'queued', jobId: data.data.id });
  }

  if (path === '/meauxcreate/status' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const jobId = body.jobId;
    const apiKey = env.CLOUDCONVERT_API_KEY;
    if (!jobId) return Response.json({ error: 'Missing Job ID' }, { status: 400 });
    const ccRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await ccRes.json();
    const job = data.data;
    if (job.status === 'finished') {
      const exportTask = job.tasks.find((t) => t.name === 'export-res');
      const fileUrl = exportTask?.result?.files?.[0]?.url;
      return Response.json({ status: 'SUCCEEDED', audio_url: fileUrl });
    }
    if (job.status === 'error') return Response.json({ status: 'FAILED' });
    return Response.json({ status: 'IN_PROGRESS', progress: 50 });
  }

  return null;
}
