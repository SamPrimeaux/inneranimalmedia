/**
 * Cloudflare Container DO — iam-cad-worker (CAD toolchain, standard-2+).
 * Binding: env.IAM_CAD_WORKER
 */
import { Container } from '@cloudflare/containers';

export class IamCadWorkerContainer extends Container {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = '45m';
  enableInternet = true;
  pingEndpoint = '/health';
}
