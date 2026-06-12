/**
 * Cloudflare Container DO — reuses registry image meauxcontainer-mycontainer (Jan 2026).
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
