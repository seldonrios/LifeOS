import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { BaseEvent, EventBus } from '@lifeos/event-bus';
import { ServiceCatalog } from '@lifeos/service-catalog';

import { runModuleLoaderBoot } from './index';

class MockEventBus implements EventBus {
  readonly published: Array<{ topic: string; event: BaseEvent<unknown> }> = [];

  async publish<T>(topic: string, event: BaseEvent<T>): Promise<void> {
    this.published.push({ topic, event: event as BaseEvent<unknown> });
  }

  async subscribe<T>(
    topic: string,
    handler: (event: BaseEvent<T>) => Promise<void>,
  ): Promise<void> {
    void topic;
    void handler;
  }
}

test('runModuleLoaderBoot emits startup diagnostics report event and stdout log', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'lifeos-modules-'));
  const moduleDir = join(tempRoot, 'voice-module');
  await mkdir(moduleDir);
  await writeFile(
    join(moduleDir, 'manifest.ts'),
    [
      'export default {',
      "  id: 'voice-module',",
      "  name: 'Voice Module',",
      "  version: '1.0.0',",
      "  provides: ['voice.handle'],",
      "  requires: ['service.voice'],",
      '  optional: [],',
      '};',
      '',
    ].join('\n'),
    'utf8',
  );

  const catalog = new ServiceCatalog();
  catalog.register({
    id: 'svc-voice',
    name: 'voice-service',
    capabilities: ['service.voice'],
    healthUrl: 'http://voice/health',
    status: 'healthy',
  });

  const bus = new MockEventBus();
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    const report = await runModuleLoaderBoot({
      modulesDir: tempRoot,
      profile: 'assistant',
      catalog,
      eventBus: bus,
    });

    assert.equal(report.modules.length, 1);
    assert.equal(report.modules[0]?.state, 'enabled');
    assert.equal(bus.published.length, 1);
    assert.equal(bus.published[0]?.topic, 'system.startup.report');
    assert.equal(logs.length, 1);
    assert.match(logs[0] ?? '', /Startup Diagnostics Report/);
  } finally {
    console.log = originalLog;
  }
});
