/**
 * Data capture-related types for the LifeOS mobile SDK.
 */

export type CaptureType = 'text' | 'voice';

export interface CaptureRequest {
  type: CaptureType;
  content: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface CaptureResult {
  id: string;
  type: CaptureType;
  content: string;
  processedAt: number;
  status: 'success' | 'pending' | 'failed';
  error?: string;
}
