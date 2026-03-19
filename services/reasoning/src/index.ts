import { createEnvSecretStore, startService } from "@lifeos/service-runtime";

startService({
  serviceName: "reasoning-service",
  port: 3001,
  secretRefs: [{ name: 'LIFEOS_LLM_API_KEY', policy: 'required_if_feature_enabled', featureGate: 'cloudLlm' }],
  secretStore: createEnvSecretStore(),
});