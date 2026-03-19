import { createEnvSecretStore, startService } from "@lifeos/service-runtime";

startService({
  serviceName: "feature-flags-service",
  port: 3008,
  secretRefs: [{ name: 'LIFEOS_FEATURE_FLAGS_DB_URL', policy: 'optional' }],
  secretStore: createEnvSecretStore(),
});