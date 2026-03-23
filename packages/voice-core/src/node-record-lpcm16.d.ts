declare module 'node-record-lpcm16' {
  interface RecordSession {
    stream(): NodeJS.ReadableStream;
    stop(): void;
  }

  interface RecordOptions {
    sampleRate?: number;
    channels?: number;
  }

  interface NodeRecordLpcm16Module {
    record(options?: RecordOptions): RecordSession;
  }

  const recorder: NodeRecordLpcm16Module;
  export default recorder;
}
