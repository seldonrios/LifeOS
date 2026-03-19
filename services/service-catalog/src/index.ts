import { createEnvSecretStore, startService } from "@lifeos/service-runtime";

startService({
  serviceName: "service-catalog-service",
  port: 3007,
  secretRefs: [{ name: 'LIFEOS_NATS_CREDS', policy: 'optional' }],
  secretStore: createEnvSecretStore(),
});