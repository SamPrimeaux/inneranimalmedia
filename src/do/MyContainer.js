/**
 * Cloudflare Container DO — iam-sandbox image (sandbox-v2, basic tier).
 * Binding: env.MY_CONTAINER
 */
import { Container } from '@cloudflare/containers';

export class MyContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = '30m';
  enableInternet = true;
  pingEndpoint = '/health';
}
