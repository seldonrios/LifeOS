import { createEnvSecretStore, startService } from "@lifeos/service-runtime";

startService({
  serviceName: "agent-mesh-service",
  port: 3003,
  secretRefs: [{ name: 'LIFEOS_NATS_CREDS', policy: 'optional' }],
  secretStore: createEnvSecretStore(),
});