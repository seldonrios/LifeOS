export * from './device-registry';
export * from './sync-engine';
export * from './trust-registry';

import { DeviceRegistry, type DeviceRegistryOptions } from './device-registry';
import { SyncEngine, type SyncEngineOptions } from './sync-engine';
import { SyncTrustRegistry, type SyncTrustRegistryOptions } from './trust-registry';

import type { LifeOSModule } from '@lifeos/module-loader';

export interface SyncModuleOptions {
  deviceName?: string;
  deviceRegistryOptions?: DeviceRegistryOptions;
  trustRegistryOptions?: SyncTrustRegistryOptions;
  syncEngineOptions?: Partial<Omit<SyncEngineOptions, 'eventBus' | 'deviceId' | 'deviceName'>>;
}

export function createSyncModule(options: SyncModuleOptions = {}): LifeOSModule {
  let engine: SyncEngine | null = null;

  return {
    id: 'sync-core',
    async init(context) {
      const registry = new DeviceRegistry({
        env: context.env,
        ...(options.deviceRegistryOptions ?? {}),
      });
      const localDeviceId = await registry.getLocalDeviceId();
      const localDeviceName =
        options.deviceName?.trim() ||
        context.env.LIFEOS_DEVICE_NAME?.trim() ||
        context.env.COMPUTERNAME?.trim() ||
        context.env.HOSTNAME?.trim() ||
        'this-device';

      engine = new SyncEngine({
        eventBus: context.eventBus,
        deviceId: localDeviceId,
        deviceName: localDeviceName,
        env: context.env,
        ...(context.graphPath ? { graphPath: context.graphPath } : {}),
        client: context.createLifeGraphClient(
          context.graphPath
            ? {
                graphPath: context.graphPath,
                env: context.env,
              }
            : {
                env: context.env,
              },
        ),
        logger: (line) => context.log(`[SyncCore] ${line}`),
        trustRegistry: new SyncTrustRegistry({
          env: context.env,
          ...(options.trustRegistryOptions ?? {}),
        }),
        requireAuthentication: (context.env.LIFEOS_SYNC_REQUIRE_AUTH ?? '1').trim() !== '0',
        trustOnFirstUse: (context.env.LIFEOS_SYNC_TOFU ?? '1').trim() !== '0',
        onIncomingDelta: async (delta) => {
          await registry.touchDevice(delta.deviceId, delta.deviceName);
        },
        ...(options.syncEngineOptions ?? {}),
      });

      await engine.start();
      context.log(`[SyncCore] active on ${localDeviceName} (${localDeviceId})`);
    },
    async dispose() {
      await engine?.close();
      engine = null;
    },
  };
}

export const syncModule = createSyncModule();
