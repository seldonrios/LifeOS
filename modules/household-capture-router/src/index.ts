import {
  HouseholdCaptureUnresolvedSchema,
  HouseholdChoreCreateRequestedSchema,
  HouseholdNoteCreateRequestedSchema,
  HouseholdReminderCreateRequestedSchema,
  HouseholdShoppingItemAddRequestedSchema,
  HouseholdVoiceCaptureCreatedSchema,
  Topics,
  type HouseholdVoiceCaptureCreated,
  type LifeOSModule,
  type ModuleRuntimeContext,
} from '@lifeos/module-sdk';

import { routeHouseholdCapture, type AiClassification } from './router';

const ROUTER_SOURCE = 'household-capture-router';

function isAiEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.LIFEOS_AI_ENABLED?.trim().toLowerCase() === 'true';
}

function resolveClassifierTimeoutMs(env: NodeJS.ProcessEnv): number {
  const rawValue = Number(env.LIFEOS_AI_TIMEOUT_MS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return 1800;
  }
  return Math.floor(rawValue);
}

function normalizeAiPayload(input: Record<string, unknown>): AiClassification {
  const rawKind = typeof input.intent === 'string' ? input.intent.trim().toLowerCase() : 'unknown';
  const kind =
    rawKind === 'shopping' || rawKind === 'reminder' || rawKind === 'chore' || rawKind === 'note'
      ? rawKind
      : 'unknown';

  const confidenceCandidate = Number(input.confidence);
  const confidence = Number.isFinite(confidenceCandidate)
    ? Math.min(1, Math.max(0, confidenceCandidate))
    : 0;

  const normalized: AiClassification = {
    kind,
    confidence,
  };
  if (typeof input.extractedText === 'string' && input.extractedText.trim().length > 0) {
    normalized.extractedText = input.extractedText.trim();
  }
  return normalized;
}

export function createAiClassifier(
  env: NodeJS.ProcessEnv,
): ((text: string) => Promise<AiClassification>) | undefined {
  if (!isAiEnabled(env)) {
    return undefined;
  }

  const model = env.LIFEOS_VOICE_MODEL?.trim() || env.LIFEOS_GOAL_MODEL?.trim() || 'llama3.1:8b';
  const host = env.OLLAMA_HOST?.trim() || 'http://127.0.0.1:11434';
  const endpoint = `${host.replace(/\/+$/, '')}/api/chat`;
  const timeoutMs = resolveClassifierTimeoutMs(env);

  return async (text: string): Promise<AiClassification> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          format: 'json',
          stream: false,
          options: {
            temperature: 0.1,
            num_ctx: 4096,
          },
          messages: [
            {
              role: 'system',
              content: `You route household captures. Return ONLY JSON with keys intent, confidence, extractedText. intent must be one of shopping|reminder|chore|note|unknown. Confidence is number 0..1.`,
            },
            {
              role: 'user',
              content: text.trim().slice(0, 800),
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`AI classification failed (${response.status})`);
      }

      const payload = (await response.json()) as {
        message?: {
          content?: unknown;
        };
      };
      if (typeof payload.message?.content !== 'string') {
        throw new Error('AI classifier returned invalid content');
      }

      const parsed = JSON.parse(payload.message.content) as Record<string, unknown>;
      return normalizeAiPayload(parsed);
    } finally {
      clearTimeout(timeout);
    }
  };
}

export const householdCaptureRouterModule: LifeOSModule = {
  id: 'household-capture-router',
  async init(context: ModuleRuntimeContext) {
    const seenCaptureIds = new Set<string>();
    const classifyWithAi = createAiClassifier(context.env);

    await context.subscribe<HouseholdVoiceCaptureCreated>(
      Topics.lifeos.householdVoiceCaptureCreated,
      async (event) => {
        const capture = HouseholdVoiceCaptureCreatedSchema.parse(event.data);
        if (seenCaptureIds.has(capture.captureId)) {
          context.log(`[household-capture-router] skipped duplicate capture ${capture.captureId}`);
          return;
        }

        const routeOptions: Parameters<typeof routeHouseholdCapture>[1] = {
          aiEnabled: isAiEnabled(context.env),
        };
        if (classifyWithAi) {
          routeOptions.classifyWithAi = classifyWithAi;
        }

        const routeResult = await routeHouseholdCapture(capture, routeOptions);

        if (routeResult.status === 'unresolved') {
          const unresolved = HouseholdCaptureUnresolvedSchema.parse({
            captureId: capture.captureId,
            householdId: capture.householdId,
            text: capture.text,
            reason: routeResult.detail,
          });
          await context.publish(
            Topics.lifeos.householdCaptureUnresolved,
            unresolved,
            ROUTER_SOURCE,
          );
          seenCaptureIds.add(capture.captureId);
          return;
        }

        if (routeResult.route.kind === 'shopping') {
          const payload = HouseholdShoppingItemAddRequestedSchema.parse(routeResult.route.payload);
          await context.publish(routeResult.route.topic, payload, ROUTER_SOURCE);
          seenCaptureIds.add(capture.captureId);
          return;
        }

        if (routeResult.route.kind === 'chore') {
          const payload = HouseholdChoreCreateRequestedSchema.parse(routeResult.route.payload);
          await context.publish(routeResult.route.topic, payload, ROUTER_SOURCE);
          seenCaptureIds.add(capture.captureId);
          return;
        }

        if (routeResult.route.kind === 'reminder') {
          const payload = HouseholdReminderCreateRequestedSchema.parse(routeResult.route.payload);
          await context.publish(routeResult.route.topic, payload, ROUTER_SOURCE);
          seenCaptureIds.add(capture.captureId);
          return;
        }

        const payload = HouseholdNoteCreateRequestedSchema.parse(routeResult.route.payload);
        await context.publish(routeResult.route.topic, payload, ROUTER_SOURCE);
        seenCaptureIds.add(capture.captureId);
      },
    );

    context.log('[household-capture-router] initialized');
  },
};

export default householdCaptureRouterModule;
