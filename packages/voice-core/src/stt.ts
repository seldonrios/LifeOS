import { spawn } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';

export interface TranscriptEvent {
  text: string;
  confidence: number;
}

export type TranscriptHandler = (event: TranscriptEvent) => Promise<void> | void;

export interface SpeechRecognitionAdapter {
  start(onTranscript: TranscriptHandler): Promise<void>;
  stop(): Promise<void>;
}

interface RecognitionLine {
  type?: 'ready' | 'transcript';
  text?: unknown;
  confidence?: unknown;
}

function toPowerShellEncodedCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function buildContinuousRecognitionScript(locale: string): string {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$recognizerInfo = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
  Where-Object { $_.Culture.Name -eq '${locale}' } |
  Select-Object -First 1
if ($null -eq $recognizerInfo) {
  throw "No installed speech recognizer found for locale ${locale}."
}
$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($recognizerInfo)
$grammar = New-Object System.Speech.Recognition.DictationGrammar
$engine.LoadGrammar($grammar)
$engine.SetInputToDefaultAudioDevice()
[Console]::Out.WriteLine('{"type":"ready"}')
[Console]::Out.Flush()
Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -Action {
  $result = $Event.SourceEventArgs.Result
  if ($null -eq $result) {
    return
  }
  if ([string]::IsNullOrWhiteSpace($result.Text)) {
    return
  }
  $payload = @{
    type = 'transcript'
    text = $result.Text
    confidence = [Math]::Round($result.Confidence, 4)
  } | ConvertTo-Json -Compress
  [Console]::Out.WriteLine($payload)
  [Console]::Out.Flush()
} | Out-Null
$engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
try {
  while ($true) {
    Start-Sleep -Milliseconds 250
  }
} finally {
  $engine.RecognizeAsyncCancel()
  $engine.Dispose()
}
`;
}

export class UnsupportedVoicePlatformError extends Error {
  constructor(message = 'Continuous local voice capture is currently available only on Windows.') {
    super(message);
    this.name = 'UnsupportedVoicePlatformError';
  }
}

export interface SystemSpeechRecognitionAdapterOptions {
  locale?: string;
  powershellPath?: string;
  logger?: (message: string) => void;
}

export class SystemSpeechRecognitionAdapter implements SpeechRecognitionAdapter {
  private process: ReturnType<typeof spawn> | null = null;
  private stdout: Interface | null = null;
  private readonly locale: string;
  private readonly powershellPath: string;
  private readonly logger: (message: string) => void;

  constructor(options: SystemSpeechRecognitionAdapterOptions = {}) {
    this.locale = options.locale ?? 'en-US';
    this.powershellPath = options.powershellPath ?? 'powershell.exe';
    this.logger = options.logger ?? (() => undefined);
  }

  async start(onTranscript: TranscriptHandler): Promise<void> {
    if (this.process) {
      return;
    }
    if (process.platform !== 'win32') {
      throw new UnsupportedVoicePlatformError();
    }

    const encodedScript = toPowerShellEncodedCommand(buildContinuousRecognitionScript(this.locale));
    const child = spawn(
      this.powershellPath,
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encodedScript,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    this.process = child;
    this.stdout = createInterface({ input: child.stdout });

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const complete = (callback: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        callback();
      };

      child.once('error', (error) => {
        complete(() => reject(error));
      });

      child.once('exit', (code, signal) => {
        const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
        complete(() => reject(new Error(`Speech recognizer exited before ready (${reason}).`)));
      });

      this.stdout?.on('line', (line) => {
        let parsed: RecognitionLine | null = null;
        try {
          parsed = JSON.parse(line) as RecognitionLine;
        } catch {
          this.logger(`[voice.stt] ignored recognizer line: ${line}`);
          return;
        }

        if (parsed.type === 'ready') {
          complete(resolve);
          return;
        }

        if (
          parsed.type === 'transcript' &&
          typeof parsed.text === 'string' &&
          typeof parsed.confidence === 'number'
        ) {
          void Promise.resolve(
            onTranscript({
              text: parsed.text,
              confidence: parsed.confidence,
            }),
          ).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            this.logger(`[voice.stt] transcript handler failed: ${message}`);
          });
        }
      });
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      const normalized = chunk.trim();
      if (normalized) {
        this.logger(`[voice.stt] ${normalized}`);
      }
    });
  }

  async stop(): Promise<void> {
    this.stdout?.close();
    this.stdout = null;

    const child = this.process;
    this.process = null;
    if (!child) {
      return;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }

    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
    });
  }
}

export interface SpeechToTextOptions {
  adapter?: SpeechRecognitionAdapter;
}

export class SpeechToText {
  private readonly adapter: SpeechRecognitionAdapter;

  constructor(options: SpeechToTextOptions = {}) {
    this.adapter = options.adapter ?? new SystemSpeechRecognitionAdapter();
  }

  async start(onTranscript: TranscriptHandler): Promise<void> {
    await this.adapter.start(onTranscript);
  }

  async stop(): Promise<void> {
    await this.adapter.stop();
  }
}
