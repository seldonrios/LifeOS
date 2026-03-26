import { resolve } from 'node:path';

import {
  buildStartupReport,
  resolveModules,
  scanModules,
} from '../packages/module-loader/src/index.ts';
import { ServiceCatalog } from '../packages/service-catalog/src/catalog.ts';

const run = async () => {
  const catalog = new ServiceCatalog();
  const requiredCaps = [
    'core.life_graph',
    'core.goal_engine',
    'service.weather.forecast',
    'ai.llm.chat',
    'media.voice.stt',
    'media.voice.tts',
    'perception.vision.image_understanding',
  ];

  requiredCaps.forEach((capability, index) => {
    catalog.register({
      id: `provider-${index}`,
      name: `Provider ${index}`,
      capabilities: [capability],
      healthUrl: 'http://localhost/health',
      status: 'healthy',
    });
  });

  const manifests = await scanModules(resolve(process.cwd(), 'modules'));
  const diagnostics = resolveModules(manifests, catalog, 'production');
  const report = buildStartupReport('production', diagnostics);

  console.log(
    JSON.stringify(
      {
        total: report.modules.length,
        states: report.modules.map((module) => ({ id: module.id, state: module.state })),
        disabled: report.modules.filter((module) => module.state === 'disabled').length,
      },
      null,
      2,
    ),
  );
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
