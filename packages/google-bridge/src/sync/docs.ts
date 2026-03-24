import type { LifeGraphClient } from '@lifeos/life-graph';
import type { ModuleRuntimeContext } from '@lifeos/module-loader';
import { summarizeForBusyUser } from './summary';

const GOOGLE_DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const GOOGLE_DOCS_DOCUMENT_ENDPOINT = 'https://docs.googleapis.com/v1/documents';
const MAX_DOCS = 10;
const MAX_TITLE_CHARS = 180;
const MAX_CONTENT_CHARS = 900;
const DOC_ID_TAG_PREFIX = 'docs:id:';

interface DriveDocumentFile {
  id?: string;
  name?: string;
  modifiedTime?: string;
}

interface DriveDocumentsResponse {
  files?: DriveDocumentFile[];
}

interface GoogleDocTextRun {
  content?: string;
}

interface GoogleDocParagraphElement {
  textRun?: GoogleDocTextRun;
}

interface GoogleDocParagraph {
  elements?: GoogleDocParagraphElement[];
}

interface GoogleDocBodyContent {
  paragraph?: GoogleDocParagraph;
}

interface GoogleDocBody {
  content?: GoogleDocBodyContent[];
}

interface GoogleDocResponse {
  title?: string;
  body?: GoogleDocBody;
}

function clampText(value: string, maxChars: number): string {
  return value.trim().slice(0, maxChars);
}

function toDocTag(fileId: string): string {
  return `${DOC_ID_TAG_PREFIX}${fileId}`;
}

function isApiUnavailableStatus(status: number): boolean {
  return status === 403 || status === 404 || status === 501;
}

function extractDocSnippet(doc: GoogleDocResponse): string {
  for (const block of doc.body?.content ?? []) {
    for (const element of block.paragraph?.elements ?? []) {
      const content = element.textRun?.content?.trim();
      if (content) {
        return content;
      }
    }
  }
  return '';
}

export async function syncGoogleDocs(
  context: ModuleRuntimeContext,
  client: LifeGraphClient,
  accessToken: string,
): Promise<number> {
  const listUrl = new URL(GOOGLE_DRIVE_FILES_ENDPOINT);
  listUrl.searchParams.set('q', "mimeType='application/vnd.google-apps.document'");
  listUrl.searchParams.set('pageSize', String(MAX_DOCS));
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
      `Google Docs list request failed (${listResponse.status}): ${body.slice(0, 240)}`,
    );
  }

  const listPayload = (await listResponse.json()) as DriveDocumentsResponse;
  const files = (listPayload.files ?? [])
    .map((file) => {
      const id = file.id?.trim();
      if (!id) {
        return null;
      }
      return {
        id,
        name: clampText(file.name?.trim() || 'Untitled document', MAX_TITLE_CHARS),
        modifiedTime: file.modifiedTime?.trim() ?? '',
      };
    })
    .filter((file): file is NonNullable<typeof file> => file !== null);

  if (files.length === 0) {
    await context.publish(
      'lifeos.bridge.google.docs.updated',
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
      .filter((tag) => tag.startsWith(DOC_ID_TAG_PREFIX)),
  );

  let appended = 0;
  for (const file of files) {
    const dedupeTag = toDocTag(file.id);
    if (existingTags.has(dedupeTag)) {
      continue;
    }

    const docResponse = await fetch(
      `${GOOGLE_DOCS_DOCUMENT_ENDPOINT}/${encodeURIComponent(file.id)}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (!docResponse.ok) {
      if (isApiUnavailableStatus(docResponse.status)) {
        await context.publish(
          'lifeos.bridge.google.docs.updated',
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
      const body = await docResponse.text();
      throw new Error(
        `Google Docs document request failed (${docResponse.status}): ${body.slice(0, 240)}`,
      );
    }

    const document = (await docResponse.json()) as GoogleDocResponse;
    const docTitle = clampText(document.title?.trim() || file.name, MAX_TITLE_CHARS);
    const snippet = clampText(extractDocSnippet(document), MAX_CONTENT_CHARS);
    const summary = await summarizeForBusyUser(context, snippet);
    const content = clampText(
      [
        file.modifiedTime ? `Modified: ${file.modifiedTime}` : null,
        `Summary: ${summary}`,
        snippet ? `Snippet: ${snippet}` : 'Snippet: (empty)',
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n'),
      MAX_CONTENT_CHARS,
    );

    const persisted = await client.appendNote({
      title: `Docs: ${docTitle}`,
      content,
      tags: ['google-docs', 'google-bridge', dedupeTag],
      voiceTriggered: false,
    });
    if ((persisted.tags ?? []).includes(dedupeTag)) {
      appended += 1;
      existingTags.add(dedupeTag);
    }
  }

  await context.publish(
    'lifeos.bridge.google.docs.updated',
    {
      count: appended,
      scanned: files.length,
      syncedAt: new Date().toISOString(),
    },
    'google-bridge',
  );

  return appended;
}
