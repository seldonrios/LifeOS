import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

interface ConsentDocument {
  mic?: boolean;
  grantedAt?: string;
}

const DEFAULT_CONSENT_PATH = join(homedir(), '.lifeos', 'consent.json');

function resolveConsentPath(): string {
  const overridePath = process.env.LIFEOS_CONSENT_PATH?.trim();
  return overridePath && overridePath.length > 0 ? overridePath : DEFAULT_CONSENT_PATH;
}

export class MissingMicrophoneConsentError extends Error {
  constructor(message = 'Microphone access required. Run: pnpm lifeos voice consent') {
    super(message);
    this.name = 'MissingMicrophoneConsentError';
  }
}

export class ConsentManager {
  private readonly consentPath: string;

  constructor(consentPath = resolveConsentPath()) {
    this.consentPath = consentPath;
  }

  async hasConsent(): Promise<boolean> {
    try {
      const raw = await readFile(this.consentPath, 'utf8');
      const data = JSON.parse(raw) as ConsentDocument;
      return data.mic === true;
    } catch {
      return false;
    }
  }

  async grantConsent(): Promise<void> {
    await mkdir(dirname(this.consentPath), { recursive: true });
    await writeFile(
      this.consentPath,
      `${JSON.stringify({ mic: true, grantedAt: new Date().toISOString() }, null, 2)}\n`,
      'utf8',
    );
  }
}

export const consent = new ConsentManager();
