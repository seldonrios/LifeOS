import { createEnvSecretStore, startService } from "@lifeos/service-runtime";

startService({
  serviceName: "secrets-service",
  port: 3006,
  isCoreService: true,
  secretRefs: [{ name: 'LIFEOS_ENCRYPTION_KEY', policy: 'required' }],
  secretStore: createEnvSecretStore(),
});