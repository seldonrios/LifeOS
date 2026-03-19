import { createEnvSecretStore, startService } from "@lifeos/service-runtime";

startService({
  serviceName: "dashboard-service",
  port: 3000,
  secretRefs: [{ name: 'LIFEOS_SESSION_SECRET', policy: 'optional' }],
  secretStore: createEnvSecretStore(),
});