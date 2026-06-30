/**
 * Cloudflare Container DO — iam-sandbox image (sandbox-v3, basic tier).
 * Pool id: inneranimalmedia (matches worker name via CONTAINER_POOL_ID var).
 * Binding: env.MY_CONTAINER
 */
import { Container } from '@cloudflare/containers';

export class MyContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = '30m';
  enableInternet = true;
  pingEndpoint = '/health';

  /** @param {Request} request */
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/__admin/destroy' && request.method === 'POST') {
      try {
        await this.destroy();
        return Response.json({ ok: true, destroyed: true });
      } catch (e) {
        return Response.json(
          { ok: false, error: String(e?.message || e).slice(0, 400) },
          { status: 500 },
        );
      }
    }
    return super.fetch(request);
  }
}
