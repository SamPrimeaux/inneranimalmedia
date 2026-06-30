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
}
