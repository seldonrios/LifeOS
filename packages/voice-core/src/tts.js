import { spawn } from 'node:child_process';
function toPowerShellEncodedCommand(script) {
    return Buffer.from(script, 'utf16le').toString('base64');
}
function buildSpeakScript(text) {
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
export class PowerShellSpeechSynthesisAdapter {
    powershellPath;
    timeoutMs;
    logger;
    constructor(options = {}) {
        this.powershellPath = options.powershellPath ?? 'powershell.exe';
        this.timeoutMs = options.timeoutMs ?? 15_000;
        this.logger = options.logger ?? (() => undefined);
    }
    async speak(text) {
        if (!text.trim() || process.platform !== 'win32') {
            return;
        }
        const encodedScript = toPowerShellEncodedCommand(buildSpeakScript(text));
        await new Promise((resolve, reject) => {
            const child = spawn(this.powershellPath, [
                '-NoProfile',
                '-NonInteractive',
                '-ExecutionPolicy',
                'Bypass',
                '-EncodedCommand',
                encodedScript,
            ], {
                stdio: ['ignore', 'ignore', 'pipe'],
            });
            let stderr = '';
            let settled = false;
            const completeResolve = () => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeout);
                resolve();
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
                completeReject(new Error(`Text-to-speech timed out after ${this.timeoutMs}ms.`));
            }, this.timeoutMs);
            child.stderr.setEncoding('utf8');
            child.stderr.on('data', (chunk) => {
                stderr += chunk;
            });
            child.once('error', (error) => {
                completeReject(error);
            });
            child.once('exit', (code) => {
                if (code === 0) {
                    completeResolve();
                    return;
                }
                const normalized = stderr.trim() || `Text-to-speech exited with code ${code ?? 0}.`;
                this.logger(`[voice.tts] ${normalized}`);
                completeReject(new Error(normalized));
            });
        });
    }
}
export class NullSpeechSynthesisAdapter {
    async speak(text) {
        void text;
        return;
    }
}
export class TextToSpeech {
    adapter;
    pending = Promise.resolve();
    constructor(options = {}) {
        this.adapter = options.adapter ?? new PowerShellSpeechSynthesisAdapter();
    }
    async speak(text) {
        const next = this.pending.catch(() => undefined).then(() => this.adapter.speak(text));
        this.pending = next.catch(() => undefined);
        await next;
    }
}
