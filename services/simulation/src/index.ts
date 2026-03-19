import { createEnvSecretStore, startService } from "@lifeos/service-runtime";

startService({
  serviceName: "simulation-service",
  port: 3004,
  secretRefs: [{ name: 'LIFEOS_LLM_API_KEY', policy: 'required_if_feature_enabled', featureGate: 'cloudLlm' }],
  secretStore: createEnvSecretStore(),
});