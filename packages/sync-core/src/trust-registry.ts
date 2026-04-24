import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const TRUST_FILE_VERSION = '0.1.0';

export interface SyncLocalKeyPair {
  algorithm: 'ed25519';
  publicKey: string;
  privateKey: string;
  createdAt: string;
}

export interface SyncTrustedPeer {
  deviceId: string;
  deviceName: string;
  publicKey: string;
  trustedAt: string;
  lastSeenAt?: string;
}

interface SyncTrustDocument {
  version: string;
  updatedAt: string;
  localNodeId: string;
  local: SyncLocalKeyPair;
  peers: SyncTrustedPeer[];
}

export interface SyncTrustRegistryOptions {
  env?: NodeJS.ProcessEnv;
  baseDir?: string;
  trustPath?: string;
  now?: () => Date;
}

function resolveHomeDir(env: NodeJS.ProcessEnv, baseDir: string): string {
  const windowsHome = `${env.HOMEDRIVE?.trim() ?? ''}${env.HOMEPATH?.trim() ?? ''}`.trim();
  return env.HOME?.trim() || env.USERPROFILE?.trim() || windowsHome || baseDir;
}

function defaultTrustPath(env: NodeJS.ProcessEnv, baseDir: string): string {
  return join(resolveHomeDir(env, baseDir), '.lifeos', 'mesh-trust.json');
}

function normalizeDeviceName(value: string | undefined): string {
  return (value ?? '').trim().slice(0, 120) || 'unknown-device';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePeer(value: unknown): SyncTrustedPeer | null {
  if (!isRecord(value)) {
    return null;
  }
  const deviceId =
    typeof value.deviceId === 'string' && value.deviceId.trim().length > 0
      ? value.deviceId.trim()
      : null;
  const publicKey =
    typeof value.publicKey === 'string' && value.publicKey.trim().length > 0
      ? value.publicKey.trim()
      : null;
  const trustedAt =
    typeof value.trustedAt === 'string' && value.trustedAt.trim().length > 0
      ? value.trustedAt.trim()
      : null;
  if (!deviceId || !publicKey || !trustedAt) {
    return null;
  }
  return {
    deviceId,
    publicKey,
    trustedAt,
    deviceName: normalizeDeviceName(typeof value.deviceName === 'string' ? value.deviceName : ''),
    ...(typeof value.lastSeenAt === 'string' && value.lastSeenAt.trim().length > 0
      ? { lastSeenAt: value.lastSeenAt.trim() }
      : {}),
  };
}

function createKeyPair(nowIso: string): SyncLocalKeyPair {
  const generated = generateKeyPairSync('ed25519');
  return {
    algorithm: 'ed25519',
    publicKey: generated.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: generated.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    createdAt: nowIso,
  };
}

function normalizeDocument(raw: unknown): SyncTrustDocument | null {
  if (!isRecord(raw) || !isRecord(raw.local) || !Array.isArray(raw.peers)) {
    return null;
  }

  const localNodeId =
    typeof raw.localNodeId === 'string' && raw.localNodeId.trim().length > 0
      ? raw.localNodeId.trim()
      : null;
  const algorithm = raw.local.algorithm;
  const publicKey =
    typeof raw.local.publicKey === 'string' && raw.local.publicKey.trim().length > 0
      ? raw.local.publicKey.trim()
      : null;
  const privateKey =
    typeof raw.local.privateKey === 'string' && raw.local.privateKey.trim().length > 0
      ? raw.local.privateKey.trim()
      : null;
  const createdAt =
    typeof raw.local.createdAt === 'string' && raw.local.createdAt.trim().length > 0
      ? raw.local.createdAt.trim()
      : null;

  if (!localNodeId || algorithm !== 'ed25519' || !publicKey || !privateKey || !createdAt) {
    return null;
  }

  const peers = raw.peers
    .map((entry) => normalizePeer(entry))
    .filter((entry): entry is SyncTrustedPeer => entry !== null);

  return {
    version: TRUST_FILE_VERSION,
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt.trim().length > 0
        ? raw.updatedAt.trim()
        : new Date().toISOString(),
    localNodeId,
    local: {
      algorithm: 'ed25519',
      publicKey,
      privateKey,
      createdAt,
    },
    peers,
  };
}

export interface SyncTrustRegistryLike {
  getLocalKeyPair(): Promise<SyncLocalKeyPair>;
  getTrustedPeer(deviceId: string): Promise<SyncTrustedPeer | null>;
  upsertTrustedPeer(
    deviceId: string,
    publicKey: string,
    deviceName?: string,
  ): Promise<SyncTrustedPeer>;
}

export class SyncTrustRegistry implements SyncTrustRegistryLike {
  private readonly env: NodeJS.ProcessEnv;
  private readonly trustPath: string;
  private readonly now: () => Date;

  constructor(options: SyncTrustRegistryOptions = {}) {
    this.env = options.env ?? process.env;
    this.now = options.now ?? (() => new Date());
    this.trustPath = options.trustPath
      ? resolve(options.trustPath)
      : defaultTrustPath(this.env, resolve(options.baseDir ?? process.cwd()));
  }

  getPath(): string {
    return this.trustPath;
  }

  async getLocalKeyPair(): Promise<SyncLocalKeyPair> {
    const document = await this.loadDocument();
    return document.local;
  }

  async getTrustedPeer(deviceId: string): Promise<SyncTrustedPeer | null> {
    const normalizedDeviceId = deviceId.trim();
    if (!normalizedDeviceId) {
      return null;
    }
    const document = await this.loadDocument();
    return document.peers.find((peer) => peer.deviceId === normalizedDeviceId) ?? null;
  }

  async upsertTrustedPeer(
    deviceId: string,
    publicKey: string,
    deviceName?: string,
  ): Promise<SyncTrustedPeer> {
    const normalizedDeviceId = deviceId.trim();
    const normalizedPublicKey = publicKey.trim();
    if (!normalizedDeviceId || !normalizedPublicKey) {
      throw new Error('Trusted peer deviceId and public key are required.');
    }

    const document = await this.loadDocument();
    const nowIso = this.now().toISOString();
    const normalizedName = normalizeDeviceName(deviceName);
    const currentIndex = document.peers.findIndex((peer) => peer.deviceId === normalizedDeviceId);
    const nextPeer: SyncTrustedPeer = {
      deviceId: normalizedDeviceId,
      publicKey: normalizedPublicKey,
      deviceName: normalizedName,
      trustedAt: currentIndex >= 0 ? (document.peers[currentIndex]?.trustedAt ?? nowIso) : nowIso,
      lastSeenAt: nowIso,
    };
    if (currentIndex >= 0) {
      document.peers[currentIndex] = nextPeer;
    } else {
      document.peers.push(nextPeer);
    }
    document.updatedAt = nowIso;
    await this.saveDocument(document);
    return nextPeer;
  }

  private async loadDocument(): Promise<SyncTrustDocument> {
    try {
      const raw = JSON.parse(await readFile(this.trustPath, 'utf8')) as unknown;
      const parsed = normalizeDocument(raw);
      if (parsed) {
        return parsed;
      }
    } catch {
      // default below
    }

    const nowIso = this.now().toISOString();
    const initial: SyncTrustDocument = {
      version: TRUST_FILE_VERSION,
      updatedAt: nowIso,
      localNodeId: randomUUID(),
      local: createKeyPair(nowIso),
      peers: [],
    };
    await this.saveDocument(initial);
    return initial;
  }

  private async saveDocument(document: SyncTrustDocument): Promise<void> {
    await mkdir(dirname(this.trustPath), { recursive: true });
    await writeFile(this.trustPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    if (process.platform !== 'win32') {
      await chmod(this.trustPath, 0o600);
    }
  }
}
