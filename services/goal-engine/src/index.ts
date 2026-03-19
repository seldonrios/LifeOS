import { createEnvSecretStore, startService } from "@lifeos/service-runtime";

startService({
  serviceName: "goal-engine-service",
  port: 3002,
  isCoreService: true,
  secretRefs: [{ name: 'LIFEOS_DB_URL', policy: 'required' }],
  secretStore: createEnvSecretStore(),
});