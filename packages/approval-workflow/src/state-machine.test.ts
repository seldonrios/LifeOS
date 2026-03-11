import assert from 'node:assert/strict';
import test from 'node:test';

import { validateApprovalTransition } from './state-machine';
import { ApprovalStatus } from './types';

test('pending -> approved is legal', () => {
  assert.equal(validateApprovalTransition(ApprovalStatus.pending, ApprovalStatus.approved), true);
});

test('pending -> rejected is legal', () => {
  assert.equal(validateApprovalTransition(ApprovalStatus.pending, ApprovalStatus.rejected), true);
});

test('pending -> expired is legal', () => {
  assert.equal(validateApprovalTransition(ApprovalStatus.pending, ApprovalStatus.expired), true);
});

test('pending -> cancelled is legal', () => {
  assert.equal(validateApprovalTransition(ApprovalStatus.pending, ApprovalStatus.cancelled), true);
});

test('approved -> rejected is illegal', () => {
  assert.equal(validateApprovalTransition(ApprovalStatus.approved, ApprovalStatus.rejected), false);
});
