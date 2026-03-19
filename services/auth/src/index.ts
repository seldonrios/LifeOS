import { createEnvSecretStore, startService } from "@lifeos/service-runtime";

startService({
  serviceName: "auth-service",
  port: 3005,
  isCoreService: true,
  secretRefs: [{ name: 'LIFEOS_JWT_SECRET', policy: 'required' }],
  secretStore: createEnvSecretStore(),
});