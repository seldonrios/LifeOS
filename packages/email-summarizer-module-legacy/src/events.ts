export interface VoiceEmailSummarizePayload {
  account?: unknown;
  limit?: unknown;
  utterance?: unknown;
}

export interface EmailDigestReadyPayload {
  count: number;
  accountLabel: string;
  digestIds: string[];
  summarizedAt: string;
}

export interface ImapCredentials {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  label: string;
}

export interface RawMessage {
  subject: string;
  from: string;
  messageId: string;
  receivedAt: string;
  body: string;
  accountLabel: string;
}

export interface SummarizedMessage {
  subject: string;
  from: string;
  messageId: string;
  receivedAt: string;
  summary: string;
  accountLabel: string;
  read: boolean;
}

export const EmailTopics = {
  voiceIntentSummarize: 'lifeos.voice.intent.email.summarize',
  voiceIntentBriefing: 'lifeos.voice.intent.briefing',
  digestReady: 'lifeos.email.digest.ready',
} as const;
