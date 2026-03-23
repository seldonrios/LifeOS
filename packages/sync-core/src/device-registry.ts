import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const DEVICES_FILE_VERSION = '0.1.0';
const MAX_DEVICE_NAME_CHARS = 80;

export interface PairedDevice {
  id: string;
  name: string;
  pairedAt: string;
  lastSeenAt?: string;
}

interface DeviceRegistryDocument {
  version: string;
  updatedAt: string;
  localDeviceId: string;
  devices: PairedDevice[];
}

export interface DeviceRegistryOptions {
  env?: NodeJS.ProcessEnv;
  baseDir?: string;
  devicesPath?: string;
  now?: () => Date;
}

function normalizeDeviceName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_DEVICE_NAME_CHARS);
}

function resolveHomeDir(env: NodeJS.ProcessEnv, baseDir: string): string {
  const home = env.HOME?.trim() || env.USERPROFILE?.trim();
  if (home) {
    return home;
  }
  return baseDir;
}

function defaultRegistryPath(env: NodeJS.ProcessEnv, baseDir: string): string {
  return join(resolveHomeDir(env, baseDir), '.lifeos', 'devices.json');
}

function normalizeRegistry(value: unknown): DeviceRegistryDocument | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<DeviceRegistryDocument>;
  if (!Array.isArray(candidate.devices)) {
    return null;
  }
  if (typeof candidate.localDeviceId !== 'string' || candidate.localDeviceId.trim().length === 0) {
    return null;
  }

  const devices = candidate.devices
    .filter((device): device is PairedDevice =>
      Boolean(
        device &&
        typeof device === 'object' &&
        typeof (device as PairedDevice).id === 'string' &&
        typeof (device as PairedDevice).name === 'string' &&
        typeof (device as PairedDevice).pairedAt === 'string',
      ),
    )
    .map((device) => ({
      id: device.id,
      name: normalizeDeviceName(device.name),
      pairedAt: device.pairedAt,
      ...(device.lastSeenAt ? { lastSeenAt: device.lastSeenAt } : {}),
    }))
    .filter((device) => device.name.length > 0);

  return {
    version: DEVICES_FILE_VERSION,
    updatedAt:
      typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
    localDeviceId: candidate.localDeviceId.trim(),
    devices,
  };
}

export class DeviceRegistry {
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => Date;
  private readonly devicesPath: string;

  constructor(options: DeviceRegistryOptions = {}) {
    this.env = options.env ?? process.env;
    this.now = options.now ?? (() => new Date());
    this.devicesPath = options.devicesPath
      ? resolve(options.devicesPath)
      : defaultRegistryPath(this.env, resolve(options.baseDir ?? process.cwd()));
  }

  getPath(): string {
    return this.devicesPath;
  }

  async getLocalDeviceId(): Promise<string> {
    const document = await this.loadDocument();
    return document.localDeviceId;
  }

  async listDevices(): Promise<PairedDevice[]> {
    const document = await this.loadDocument();
    return [...document.devices].sort((left, right) => left.name.localeCompare(right.name));
  }

  async pairDevice(name: string, deviceId: string = randomUUID()): Promise<PairedDevice> {
    const normalizedName = normalizeDeviceName(name);
    if (!normalizedName) {
      throw new Error('Device name is required.');
    }

    const document = await this.loadDocument();
    const nowIso = this.now().toISOString();
    const existingIndex = document.devices.findIndex(
      (device) =>
        device.id === deviceId || device.name.toLowerCase() === normalizedName.toLowerCase(),
    );
    const existing = existingIndex >= 0 ? document.devices[existingIndex] : null;
    const next: PairedDevice = {
      id: deviceId,
      name: normalizedName,
      pairedAt: existing ? existing.pairedAt : nowIso,
      lastSeenAt: nowIso,
    };
    if (existingIndex >= 0) {
      document.devices[existingIndex] = next;
    } else {
      document.devices.push(next);
    }
    document.updatedAt = nowIso;
    await this.saveDocument(document);
    return next;
  }

  async touchDevice(deviceId: string, name?: string): Promise<void> {
    const normalizedId = deviceId.trim();
    if (!normalizedId) {
      return;
    }

    const document = await this.loadDocument();
    const nowIso = this.now().toISOString();
    const normalizedName = name ? normalizeDeviceName(name) : '';
    const existingIndex = document.devices.findIndex((device) => device.id === normalizedId);
    if (existingIndex >= 0) {
      const existing = document.devices[existingIndex];
      if (!existing) {
        return;
      }
      document.devices[existingIndex] = {
        id: existing.id,
        pairedAt: existing.pairedAt,
        name: normalizedName || existing.name,
        lastSeenAt: nowIso,
      };
    } else if (normalizedName) {
      document.devices.push({
        id: normalizedId,
        name: normalizedName,
        pairedAt: nowIso,
        lastSeenAt: nowIso,
      });
    } else {
      return;
    }

    document.updatedAt = nowIso;
    await this.saveDocument(document);
  }

  private async loadDocument(): Promise<DeviceRegistryDocument> {
    try {
      const raw = await readFile(this.devicesPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      const normalized = normalizeRegistry(parsed);
      if (normalized) {
        return normalized;
      }
    } catch {
      // default below
    }

    const fallback: DeviceRegistryDocument = {
      version: DEVICES_FILE_VERSION,
      updatedAt: this.now().toISOString(),
      localDeviceId: randomUUID(),
      devices: [],
    };
    await this.saveDocument(fallback);
    return fallback;
  }

  private async saveDocument(document: DeviceRegistryDocument): Promise<void> {
    await mkdir(dirname(this.devicesPath), { recursive: true });
    await writeFile(this.devicesPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  }
}
