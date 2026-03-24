import type { LifeGraphClient } from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const MAX_DRIVE_FILES = 15;
const MAX_TITLE_CHARS = 180;
const MAX_CONTENT_CHARS = 700;
const DRIVE_ID_TAG_PREFIX = 'drive:id:';

interface GoogleDriveFile {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface GoogleDriveFilesResponse {
  files?: GoogleDriveFile[];
}

function clampText(value: string, maxChars: number): string {
  return value.trim().slice(0, maxChars);
}

function toDriveTag(fileId: string): string {
  return `${DRIVE_ID_TAG_PREFIX}${fileId}`;
}

export async function syncGoogleDriveFiles(
  context: ModuleRuntimeContext,
  client: LifeGraphClient,
  accessToken: string,
): Promise<number> {
  const url = new URL(DRIVE_FILES_ENDPOINT);
  url.searchParams.set('pageSize', String(MAX_DRIVE_FILES));
  url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,webViewLink)');
  url.searchParams.set('orderBy', 'modifiedTime desc');

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Drive request failed (${response.status}): ${body.slice(0, 240)}`);
  }

  const payload = (await response.json()) as GoogleDriveFilesResponse;
  const files = (payload.files ?? [])
    .map((file) => {
      const id = file.id?.trim();
      if (!id) {
        return null;
      }
      return {
        id,
        name: clampText(file.name?.trim() || 'Untitled file', MAX_TITLE_CHARS),
        mimeType: clampText(file.mimeType?.trim() || 'unknown', 120),
        modifiedTime: file.modifiedTime?.trim() ?? '',
        webViewLink: file.webViewLink?.trim() ?? '',
      };
    })
    .filter((file): file is NonNullable<typeof file> => file !== null);

  if (files.length === 0) {
    await context.publish(
      'lifeos.bridge.google.drive.updated',
      {
        count: 0,
        scanned: 0,
        syncedAt: new Date().toISOString(),
      },
      'google-bridge',
    );
    return 0;
  }

  const graph = await client.loadGraph();
  const existingTags = new Set(
    (graph.notes ?? [])
      .flatMap((note) => note.tags ?? [])
      .filter((tag) => tag.startsWith(DRIVE_ID_TAG_PREFIX)),
  );

  let appended = 0;
  for (const file of files) {
    const dedupeTag = toDriveTag(file.id);
    if (existingTags.has(dedupeTag)) {
      continue;
    }

    const content = clampText(
      [
        `Type: ${file.mimeType}`,
        file.modifiedTime ? `Modified: ${file.modifiedTime}` : null,
        file.webViewLink ? `Link: ${file.webViewLink}` : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n'),
      MAX_CONTENT_CHARS,
    );

    const persisted = await client.appendNote({
      title: `Drive: ${file.name}`,
      content: content || 'Google Drive file',
      tags: ['google-drive', 'google-bridge', dedupeTag],
      voiceTriggered: false,
    });
    if ((persisted.tags ?? []).includes(dedupeTag)) {
      appended += 1;
      existingTags.add(dedupeTag);
    }
  }

  await context.publish(
    'lifeos.bridge.google.drive.updated',
    {
      count: appended,
      scanned: files.length,
      syncedAt: new Date().toISOString(),
    },
    'google-bridge',
  );

  return appended;
}
