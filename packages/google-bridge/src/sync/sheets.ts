import type { LifeGraphClient } from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';

const GOOGLE_DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const GOOGLE_SHEETS_VALUES_ENDPOINT = 'https://sheets.googleapis.com/v4/spreadsheets';
const MAX_SHEETS = 8;
const MAX_TITLE_CHARS = 180;
const MAX_CONTENT_CHARS = 900;
const SHEET_ID_TAG_PREFIX = 'sheets:id:';

interface DriveSheetFile {
  id?: string;
  name?: string;
  modifiedTime?: string;
}

interface DriveSheetsResponse {
  files?: DriveSheetFile[];
}

interface GoogleSheetValuesResponse {
  values?: string[][];
}

function clampText(value: string, maxChars: number): string {
  return value.trim().slice(0, maxChars);
}

function toSheetTag(fileId: string): string {
  return `${SHEET_ID_TAG_PREFIX}${fileId}`;
}

function isApiUnavailableStatus(status: number): boolean {
  return status === 403 || status === 404 || status === 501;
}

function formatPreview(values: string[][] | undefined): string {
  const firstRow = Array.isArray(values) ? values[0] : undefined;
  if (!Array.isArray(firstRow) || firstRow.length === 0) {
    return 'No data';
  }
  const asText = firstRow
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
    .join(', ');
  return asText || 'No data';
}

export async function syncGoogleSheets(
  context: ModuleRuntimeContext,
  client: LifeGraphClient,
  accessToken: string,
): Promise<number> {
  const listUrl = new URL(GOOGLE_DRIVE_FILES_ENDPOINT);
  listUrl.searchParams.set('q', "mimeType='application/vnd.google-apps.spreadsheet'");
  listUrl.searchParams.set('pageSize', String(MAX_SHEETS));
  listUrl.searchParams.set('fields', 'files(id,name,modifiedTime)');
  listUrl.searchParams.set('orderBy', 'modifiedTime desc');

  const listResponse = await fetch(listUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  if (!listResponse.ok) {
    const body = await listResponse.text();
    throw new Error(
      `Google Sheets list request failed (${listResponse.status}): ${body.slice(0, 240)}`,
    );
  }

  const listPayload = (await listResponse.json()) as DriveSheetsResponse;
  const files = (listPayload.files ?? [])
    .map((file) => {
      const id = file.id?.trim();
      if (!id) {
        return null;
      }
      return {
        id,
        name: clampText(file.name?.trim() || 'Untitled spreadsheet', MAX_TITLE_CHARS),
        modifiedTime: file.modifiedTime?.trim() ?? '',
      };
    })
    .filter((file): file is NonNullable<typeof file> => file !== null);

  if (files.length === 0) {
    await context.publish(
      'lifeos.bridge.google.sheets.updated',
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
      .filter((tag) => tag.startsWith(SHEET_ID_TAG_PREFIX)),
  );

  let appended = 0;
  for (const file of files) {
    const dedupeTag = toSheetTag(file.id);
    if (existingTags.has(dedupeTag)) {
      continue;
    }

    const valuesResponse = await fetch(
      `${GOOGLE_SHEETS_VALUES_ENDPOINT}/${encodeURIComponent(file.id)}/values/${encodeURIComponent('A1:Z10')}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (!valuesResponse.ok) {
      if (isApiUnavailableStatus(valuesResponse.status)) {
        await context.publish(
          'lifeos.bridge.google.sheets.updated',
          {
            count: 0,
            scanned: files.length,
            reason: 'api_unavailable',
            syncedAt: new Date().toISOString(),
          },
          'google-bridge',
        );
        return 0;
      }
      const body = await valuesResponse.text();
      throw new Error(
        `Google Sheets values request failed (${valuesResponse.status}): ${body.slice(0, 240)}`,
      );
    }

    const valuesPayload = (await valuesResponse.json()) as GoogleSheetValuesResponse;
    const preview = clampText(formatPreview(valuesPayload.values), MAX_CONTENT_CHARS);
    const content = clampText(
      [file.modifiedTime ? `Modified: ${file.modifiedTime}` : null, `Preview: ${preview}`]
        .filter((line): line is string => Boolean(line))
        .join('\n'),
      MAX_CONTENT_CHARS,
    );

    const persisted = await client.appendNote({
      title: `Sheets: ${file.name}`,
      content,
      tags: ['google-sheets', 'google-bridge', dedupeTag],
      voiceTriggered: false,
    });
    if ((persisted.tags ?? []).includes(dedupeTag)) {
      appended += 1;
      existingTags.add(dedupeTag);
    }
  }

  await context.publish(
    'lifeos.bridge.google.sheets.updated',
    {
      count: appended,
      scanned: files.length,
      syncedAt: new Date().toISOString(),
    },
    'google-bridge',
  );

  return appended;
}
