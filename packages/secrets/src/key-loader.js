import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SecretsError } from './types';
export async function loadEncryptionKey() {
    const envKey = process.env.LIFEOS_MASTER_KEY?.trim();
    if (envKey) {
        return Buffer.from(envKey, 'utf8');
    }
    const thisFile = fileURLToPath(import.meta.url);
    const rootDir = resolve(dirname(thisFile), '../../../');
    const keyPath = resolve(rootDir, '.secrets/master.key');
    try {
        const key = (await readFile(keyPath, 'utf8')).trim();
        if (!key) {
            throw new SecretsError(`Encryption key file is empty at ${keyPath}.`);
        }
        return Buffer.from(key, 'utf8');
    }
    catch {
        throw new SecretsError('Unable to load master encryption key. Set LIFEOS_MASTER_KEY or create .secrets/master.key.');
    }
}
