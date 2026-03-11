import { startService } from "@lifeos/service-runtime";

startService({ serviceName: "otel-collector-service", port: 4317 });