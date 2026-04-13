import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
function toPowerShellEncodedCommand(script) {
    return Buffer.from(script, 'utf16le').toString('base64');
}
function toPowerShellLiteral(value) {
    return value.replace(/'/g, "''");
}
export function pcm16ToWav(audioBuffer, sampleRate, channels) {
    const header = Buffer.alloc(44);
    const byteRate = sampleRate * channels * 2;
    const blockAlign = channels * 2;
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + audioBuffer.length, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(audioBuffer.length, 40);
    return Buffer.concat([header, audioBuffer]);
}
function buildContinuousRecognitionScript(locale) {
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
function buildFileTranscriptionScript(locale, waveFilePath) {
    const escapedWavePath = toPowerShellLiteral(waveFilePath);
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
$engine.SetInputToWaveFile('${escapedWavePath}')
$result = $engine.Recognize()
if ($null -eq $result -or [string]::IsNullOrWhiteSpace($result.Text)) {
  [Console]::Out.WriteLine('{"text":"","confidence":0}')
} else {
  $payload = @{
    text = $result.Text
    confidence = [Math]::Round($result.Confidence, 4)
  } | ConvertTo-Json -Compress
  [Console]::Out.WriteLine($payload)
}
$engine.Dispose()
`;
}
export class UnsupportedVoicePlatformError extends Error {
    constructor(message = 'Continuous local voice capture is currently available only on Windows.') {
        super(message);
        this.name = 'UnsupportedVoicePlatformError';
    }
}
export class SystemSpeechRecognitionAdapter {
    process = null;
    stdout = null;
    locale;
    powershellPath;
    sampleRate;
    channels;
    logger;
    startupTimeoutMs;
    transcriptionTimeoutMs;
    stopTimeoutMs;
    constructor(options = {}) {
        this.locale = options.locale ?? 'en-US';
        this.powershellPath = options.powershellPath ?? 'powershell.exe';
        this.sampleRate = options.sampleRate ?? 16000;
        this.channels = options.channels ?? 1;
        this.logger = options.logger ?? (() => undefined);
        this.startupTimeoutMs = options.startupTimeoutMs ?? 10_000;
        this.transcriptionTimeoutMs = options.transcriptionTimeoutMs ?? 12_000;
        this.stopTimeoutMs = options.stopTimeoutMs ?? 2_000;
    }
    async start(onTranscript) {
        if (this.process) {
            return;
        }
        if (process.platform !== 'win32') {
            throw new UnsupportedVoicePlatformError();
        }
        const encodedScript = toPowerShellEncodedCommand(buildContinuousRecognitionScript(this.locale));
        const child = spawn(this.powershellPath, [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-EncodedCommand',
            encodedScript,
        ], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.process = child;
        this.stdout = createInterface({ input: child.stdout });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk) => {
            const normalized = chunk.trim();
            if (normalized) {
                this.logger(`[voice.stt] ${normalized}`);
            }
        });
        await new Promise((resolve, reject) => {
            let settled = false;
            let recognizerReady = false;
            const timeout = setTimeout(() => {
                complete(() => {
                    if (child.exitCode === null && child.signalCode === null) {
                        child.kill();
                    }
                    reject(new Error(`Speech recognizer did not become ready within ${this.startupTimeoutMs}ms.`));
                });
            }, this.startupTimeoutMs);
            const complete = (callback) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeout);
                callback();
            };
            child.once('error', (error) => {
                if (recognizerReady) {
                    this.logger(`[voice.stt] recognizer process error: ${error.message}`);
                    return;
                }
                complete(() => reject(error));
            });
            child.on('exit', (code, signal) => {
                this.process = null;
                this.stdout?.close();
                this.stdout = null;
                const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
                if (!recognizerReady) {
                    complete(() => reject(new Error(`Speech recognizer exited before ready (${reason}).`)));
                    return;
                }
                this.logger(`[voice.stt] recognizer stopped (${reason}).`);
            });
            this.stdout?.on('line', (line) => {
                let parsed = null;
                try {
                    parsed = JSON.parse(line);
                }
                catch {
                    this.logger(`[voice.stt] ignored recognizer line: ${line}`);
                    return;
                }
                if (parsed.type === 'ready') {
                    recognizerReady = true;
                    complete(resolve);
                    return;
                }
                if (parsed.type === 'transcript' &&
                    typeof parsed.text === 'string' &&
                    typeof parsed.confidence === 'number') {
                    void Promise.resolve(onTranscript({
                        text: parsed.text,
                        confidence: parsed.confidence,
                    })).catch((error) => {
                        const message = error instanceof Error ? error.message : String(error);
                        this.logger(`[voice.stt] transcript handler failed: ${message}`);
                    });
                }
            });
        });
    }
    async stop() {
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
        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                if (child.exitCode === null && child.signalCode === null) {
                    child.kill('SIGKILL');
                }
            }, this.stopTimeoutMs);
            child.once('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
            child.kill();
        });
    }
    async transcribe(audioBuffer) {
        if (process.platform !== 'win32') {
            throw new UnsupportedVoicePlatformError();
        }
        if (audioBuffer.length === 0) {
            return '';
        }
        const tempDir = await mkdtemp(join(tmpdir(), 'lifeos-stt-'));
        const wavePath = join(tempDir, 'wake-command.wav');
        const waveBuffer = pcm16ToWav(audioBuffer, this.sampleRate, this.channels);
        try {
            await writeFile(wavePath, waveBuffer);
            const stdout = await this.runPowerShellScript(buildFileTranscriptionScript(this.locale, wavePath), this.transcriptionTimeoutMs);
            const lines = stdout
                .split(/\r?\n/g)
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0);
            const line = [...lines].reverse().find((entry) => entry.startsWith('{') && entry.endsWith('}')) ??
                lines[lines.length - 1];
            if (!line) {
                return '';
            }
            try {
                const parsed = JSON.parse(line);
                return typeof parsed.text === 'string' ? parsed.text.trim() : '';
            }
            catch {
                this.logger(`[voice.stt] unable to parse transcription payload: ${line}`);
                return '';
            }
        }
        finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    }
    async runPowerShellScript(script, timeoutMs) {
        const encodedScript = toPowerShellEncodedCommand(script);
        return new Promise((resolve, reject) => {
            const child = spawn(this.powershellPath, [
                '-NoProfile',
                '-NonInteractive',
                '-ExecutionPolicy',
                'Bypass',
                '-EncodedCommand',
                encodedScript,
            ], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            let stdout = '';
            let stderr = '';
            let settled = false;
            const completeResolve = (value) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeout);
                resolve(value);
            };
            const completeReject = (error) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeout);
                reject(error);
            };
            const timeout = setTimeout(() => {
                if (child.exitCode === null && child.signalCode === null) {
                    child.kill();
                }
                completeReject(new Error(`STT transcription timed out after ${timeoutMs}ms.`));
            }, timeoutMs);
            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');
            child.stdout.on('data', (chunk) => {
                stdout += chunk;
            });
            child.stderr.on('data', (chunk) => {
                stderr += chunk;
            });
            child.once('error', (error) => {
                completeReject(error);
            });
            child.once('exit', (code, signal) => {
                if (code === 0) {
                    completeResolve(stdout);
                    return;
                }
                const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
                const normalizedErr = stderr.trim();
                completeReject(new Error(normalizedErr.length > 0
                    ? `STT transcription failed (${reason}): ${normalizedErr}`
                    : `STT transcription failed (${reason}).`));
            });
        });
    }
}
export class SpeechToText {
    adapter;
    constructor(options = {}) {
        this.adapter = options.adapter ?? new SystemSpeechRecognitionAdapter();
    }
    async start(onTranscript) {
        await this.adapter.start(onTranscript);
    }
    async transcribe(audioBuffer) {
        return this.adapter.transcribe(audioBuffer);
    }
    async stop() {
        await this.adapter.stop();
    }
}
