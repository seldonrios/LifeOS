import { spawn } from 'node:child_process';

function toPowerShellEncodedCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function buildSpeakScript(text: string): string {
  const encodedText = Buffer.from(text, 'utf8').toString('base64');
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedText}'))
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $synth.Speak($text)
} finally {
  $synth.Dispose()
}
`;
}

export interface SpeechSynthesisAdapter {
  speak(text: string): Promise<void>;
}

export interface PowerShellSpeechSynthesisAdapterOptions {
  powershellPath?: string;
}

export class PowerShellSpeechSynthesisAdapter implements SpeechSynthesisAdapter {
  private readonly powershellPath: string;

  constructor(options: PowerShellSpeechSynthesisAdapterOptions = {}) {
    this.powershellPath = options.powershellPath ?? 'powershell.exe';
  }

  async speak(text: string): Promise<void> {
    if (!text.trim() || process.platform !== 'win32') {
      return;
    }

    const encodedScript = toPowerShellEncodedCommand(buildSpeakScript(text));
    await new Promise<void>((resolve, reject) => {
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
          stdio: ['ignore', 'ignore', 'pipe'],
        },
      );

      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(stderr.trim() || `Text-to-speech exited with code ${code ?? 0}.`));
      });
    });
  }
}

export class NullSpeechSynthesisAdapter implements SpeechSynthesisAdapter {
  async speak(text: string): Promise<void> {
    void text;
    return;
  }
}

export interface TextToSpeechOptions {
  adapter?: SpeechSynthesisAdapter;
}

export class TextToSpeech {
  private readonly adapter: SpeechSynthesisAdapter;

  constructor(options: TextToSpeechOptions = {}) {
    this.adapter = options.adapter ?? new PowerShellSpeechSynthesisAdapter();
  }

  async speak(text: string): Promise<void> {
    await this.adapter.speak(text);
  }
}
