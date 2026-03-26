# Mesh Protocol v1 Contract

Status: active contract for Phase 3 foundation.

## Purpose

Define the stable control-plane and delegation contract for trusted LifeOS node collaboration.

## Node Identity and Capabilities

- Each node advertises:
  - `nodeId` (lowercase token id)
  - `role` (`primary | heavy-compute | fallback`)
  - `capabilities` (normalized capability list)
  - `rpcUrl` (HTTP/S endpoint)
- Identity and capabilities are persisted in mesh state and heartbeat caches under `~/.lifeos`.

## Control Plane

- Heartbeat topic: `lifeos.mesh.node.heartbeat`
- Node-left topic: `lifeos.mesh.node.left`
- Leader events:
  - `lifeos.mesh.leader.elected`
  - `lifeos.mesh.leader.changed`
  - `lifeos.mesh.leader.lost`
- Leader election order (healthy nodes only):
  1. role priority `primary` > `heavy-compute` > `fallback`
  2. freshest heartbeat
  3. lexical `nodeId`
- Leader lease snapshot persists `leaderId`, `leaseUntil`, `electedAt`, `term`.

## Data Plane (RPC)

- `POST /rpc/goal-plan`
  - auth scope: `mesh.goal.plan`
  - body: `{ goal, model?, requestedAt?, traceId? }`
  - result: `{ plan }`
- `POST /rpc/intent-publish`
  - auth scope: `mesh.intent.publish`
  - allowlisted topics only (heavy intent topics)
  - body: `{ topic, data, source?, traceId? }`
  - result: `{ accepted: true }`

## Delegation and Fallback Semantics

- Scheduler precedence: explicit assignment > healthy capability candidate > local fallback.
- Delegation transparency events:
  - `lifeos.mesh.delegate.requested`
  - `lifeos.mesh.delegate.accepted`
  - `lifeos.mesh.delegate.completed`
  - `lifeos.mesh.delegate.failed`
  - `lifeos.mesh.delegate.fallback_local`
- Failures (`timeout`, `auth`, `no_node`, `rpc_error`) must preserve local fallback behavior.

## Trace Correlation Contract

- Delegation flows must include a `traceId` for request/accept/complete/fail/fallback events.
- RPC request payloads carry `traceId` when available.
- Mesh runtime logs should include `traceId` for goal-plan and intent-publish receipts.

## Deterministic Test Coverage (Required)

- Leader election ordering and lease rollover.
- Leader lost when all nodes stale.
- RPC auth reject paths (missing token, wrong scope, invalid token).
- Delegation success and no-node fallback.
- Trace id propagation through delegation and RPC logs.
