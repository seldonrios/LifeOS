import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { DeviceRegistry } from './device-registry';

test('device registry persists local id and paired devices', async () => {
  const base = await mkdtemp(join(tmpdir(), 'lifeos-sync-registry-'));
  const devicesPath = join(base, '.lifeos', 'devices.json');

  const registry = new DeviceRegistry({
    env: { HOME: base },
    now: () => new Date('2026-03-23T12:00:00.000Z'),
    devicesPath,
  });
  const localDeviceId = await registry.getLocalDeviceId();
  assert.ok(localDeviceId.length > 0);

  const paired = await registry.pairDevice('Laptop');
  assert.equal(paired.name, 'Laptop');

  const listed = await registry.listDevices();
  assert.equal(listed.length, 1);
  const firstDevice = listed[0];
  assert.ok(firstDevice);
  assert.equal(firstDevice.name, 'Laptop');
  assert.equal(firstDevice.lastSeenAt, '2026-03-23T12:00:00.000Z');

  const second = new DeviceRegistry({
    env: { HOME: base },
    devicesPath,
  });
  const localDeviceIdSecondRead = await second.getLocalDeviceId();
  assert.equal(localDeviceIdSecondRead, localDeviceId);
});

test('touchDevice updates known pair last seen timestamp', async () => {
  const base = await mkdtemp(join(tmpdir(), 'lifeos-sync-touch-'));
  const devicesPath = join(base, '.lifeos', 'devices.json');
  const registry = new DeviceRegistry({
    env: { HOME: base },
    now: () => new Date('2026-03-23T13:00:00.000Z'),
    devicesPath,
  });
  const paired = await registry.pairDevice('Tablet', 'device-tablet');
  assert.equal(paired.id, 'device-tablet');

  const touchRegistry = new DeviceRegistry({
    env: { HOME: base },
    now: () => new Date('2026-03-23T14:30:00.000Z'),
    devicesPath,
  });
  await touchRegistry.touchDevice('device-tablet', 'Tablet');

  const listed = await touchRegistry.listDevices();
  assert.equal(listed.length, 1);
  const firstDevice = listed[0];
  assert.ok(firstDevice);
  assert.equal(firstDevice.lastSeenAt, '2026-03-23T14:30:00.000Z');

  const raw = JSON.parse(await readFile(devicesPath, 'utf8')) as { devices: Array<{ id: string }> };
  const firstRaw = raw.devices[0];
  assert.ok(firstRaw);
  assert.equal(firstRaw.id, 'device-tablet');
});
