import type { ApprovalStatus } from './types';

const asApprovalStatus = (status: string): ApprovalStatus => status as ApprovalStatus;

export const APPROVAL_TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  pending: [
    asApprovalStatus('approved'),
    asApprovalStatus('rejected'),
    asApprovalStatus('expired'),
    asApprovalStatus('cancelled'),
  ],
  approved: [],
  rejected: [],
  expired: [],
  cancelled: [],
};

export class ApprovalTransitionError extends Error {
  constructor(
    public readonly from: ApprovalStatus,
    public readonly to: ApprovalStatus,
  ) {
    super(`Illegal approval transition: ${from} -> ${to}`);
    this.name = 'ApprovalTransitionError';
  }
}

export function validateApprovalTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return APPROVAL_TRANSITIONS[from].includes(to);
}
