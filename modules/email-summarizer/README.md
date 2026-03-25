# email-summarizer

A local-first community module that fetches unread email via IMAP and summarizes it on your machine. No cloud service is required.

## Setup

Run setup from the workspace root:

```bash
pnpm lifeos module setup email-summarizer
```

The setup flow prompts for IMAP host, port, username, password, and account label, then writes credentials to:

- ~/.lifeos/secrets/email-accounts.json

On Unix-like systems, the credentials file is written with mode 600.

## Events

- Subscribe: lifeos.voice.intent.email.summarize
- Subscribe: lifeos.voice.intent.briefing
- Publish: lifeos.email.digest.ready

## Environment variables

- LIFEOS_EMAIL_MARK_READ: controls whether fetched unread messages are marked as read. Default is true.
- OLLAMA_HOST: Ollama base URL used for summarization.
- LIFEOS_EMAIL_MODEL: model used for email summarization.

## Development

Run tests from workspace root:

```bash
pnpm exec tsx --test modules/email-summarizer/src/index.test.ts
```

## Security note

IMAP passwords are stored locally in plaintext in the credentials file. They are not synced to cloud services by this module.
