export * from './types';
export * from './state-machine';

import type { ApprovalWorkflowClient } from './types';

export function createApprovalWorkflowClient(): ApprovalWorkflowClient {
  throw new Error('createApprovalWorkflowClient is not implemented.');
}
