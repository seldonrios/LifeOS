/**
 * SDK client configuration contract shared across SDK producers/consumers.
 */

export interface SDKConfig {
  baseUrl: string;
  getAccessToken: () => string | null;
  onAuthExpired: () => void;
  timeout?: number;
}
