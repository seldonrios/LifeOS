import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { ForceGraphMethods } from 'react-force-graph-2d';

import { ErrorBanner } from '../components/ErrorBanner';
import { Spinner } from '../components/Spinner';
import { useGraph } from '../hooks/useGraph';
import { isMockRuntime } from '../ipc';
import type { GraphSummary } from '../ipc';

interface GoalNode {
  id: string;
  label: string;
  completedTasks: number;
  totalTasks: number;
}

interface ActiveGoalView extends GoalNode {
  title: string;
}

interface GoalLink {
  source: string;
  target: string;
  relationship?: string;
}

type GraphRelationshipLink =
  | NonNullable<GraphSummary['goalLinks']>[number]
  | NonNullable<GraphSummary['relationships']>[number];

const DEFAULT_GRAPH_HEIGHT = 420;
const MIN_GRAPH_ZOOM = 0.35;
const MAX_GRAPH_ZOOM = 2.5;
const FIT_TO_VIEW_DURATION_MS = 450;
const FIT_TO_VIEW_PADDING_PX = 46;
const MAX_LABEL_LENGTH = 80;
const MIN_NODE_RADIUS = 7;
const MAX_NODE_RADIUS = 18;
const TASKS_AT_MAX_RADIUS = 12;
const SELECTED_NODE_RING_WIDTH = 3;

interface CanvasSize {
  width: number;
  height: number;
}

function getSafeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampTaskCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function truncateLabel(label: string): string {
  return label.length > MAX_LABEL_LENGTH ? `${label.slice(0, MAX_LABEL_LENGTH - 1)}…` : label;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getNodeRadius(totalTasks: number): number {
  if (totalTasks <= 0) {
    return MIN_NODE_RADIUS;
  }

  const normalized = clamp(totalTasks / TASKS_AT_MAX_RADIUS, 0, 1);
  return MIN_NODE_RADIUS + (MAX_NODE_RADIUS - MIN_NODE_RADIUS) * normalized;
}

function getCompletionRatio(completedTasks: number, totalTasks: number): number {
  if (totalTasks <= 0) {
    return 0;
  }

  return clamp(completedTasks / totalTasks, 0, 1);
}

function parseHexColor(value: string): [number, number, number] | null {
  const normalized = value.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(normalized);
  if (!match) {
    return null;
  }

  const hex = match[1].length === 3
    ? match[1]
        .split('')
        .map((part) => `${part}${part}`)
        .join('')
    : match[1];

  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function interpolateColor(start: string, end: string, ratio: number): string {
  const startRgb = parseHexColor(start);
  const endRgb = parseHexColor(end);
  if (!startRgb || !endRgb) {
    return end;
  }

  const boundedRatio = clamp(ratio, 0, 1);
  const channels = startRgb.map((channel, index) =>
    Math.round(channel + (endRgb[index] - channel) * boundedRatio),
  );

  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

function readThemeColor(variableName: string, fallback: string): string {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const value = window.getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value.length > 0 ? value : fallback;
}

function normalizeActiveGoals(summary: GraphSummary | undefined): ActiveGoalView[] {
  const source = summary?.activeGoals;
  if (!Array.isArray(source) || source.length === 0) {
    return [];
  }

  const normalized: ActiveGoalView[] = [];
  const seen = new Set<string>();

  for (const goal of source) {
    const id = getSafeString(goal.id);
    if (!id || seen.has(id)) {
      continue;
    }

    const title = getSafeString(goal.title) ?? id;
    const completedTasks = clampTaskCount(goal.completedTasks);
    const totalTasks = Math.max(clampTaskCount(goal.totalTasks), completedTasks);

    normalized.push({
      id,
      title,
      label: truncateLabel(title),
      completedTasks,
      totalTasks,
    });
    seen.add(id);
  }

  return normalized;
}

function getProgressValues(completedTasks: number, totalTasks: number): {
  ariaNow: number;
  ariaMax: number;
  percent: number;
} {
  const max = Math.max(1, totalTasks);
  const now = Math.min(Math.max(completedTasks, 0), max);

  return {
    ariaNow: now,
    ariaMax: max,
    percent: Math.round((now / max) * 100),
  };
}

function normalizeLink(
  rawLink: GraphRelationshipLink,
  nodeIds: Set<string>,
): GoalLink | null {
  const source = getSafeString(rawLink.sourceId) ?? getSafeString(rawLink.source);
  const target = getSafeString(rawLink.targetId) ?? getSafeString(rawLink.target);

  if (!source || !target || source === target) {
    return null;
  }

  if (!nodeIds.has(source) || !nodeIds.has(target)) {
    return null;
  }

  return {
    source,
    target,
    relationship:
      getSafeString(rawLink.relationship) ??
      getSafeString(rawLink.relation) ??
      getSafeString(rawLink.type) ??
      undefined,
  };
}

function getRelationshipLinks(summary: GraphSummary | undefined, nodeIds: Set<string>): GoalLink[] {
  const relationshipLinks: GraphRelationshipLink[] =
    summary?.goalLinks ?? summary?.relationships ?? [];
  if (relationshipLinks.length === 0) {
    return [];
  }

  const deduped = new Map<string, GoalLink>();
  for (const rawLink of relationshipLinks) {
    const normalizedLink = normalizeLink(rawLink, nodeIds);
    if (!normalizedLink) {
      continue;
    }

    const key = `${normalizedLink.source}->${normalizedLink.target}:${normalizedLink.relationship ?? ''}`;
    deduped.set(key, normalizedLink);
  }

  return Array.from(deduped.values());
}

export function LifeGraph(): JSX.Element {
  const graphQuery = useGraph();
  const usingMockRuntime = isMockRuntime();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const forceGraphRef = useRef<ForceGraphMethods<GoalNode, GoalLink> | undefined>(undefined);
  const [canvasContainer, setCanvasContainer] = useState<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: DEFAULT_GRAPH_HEIGHT });
  const activeGoals = useMemo(() => normalizeActiveGoals(graphQuery.data), [graphQuery.data]);
  const nodeIds = useMemo(() => new Set(activeGoals.map((goal) => goal.id)), [activeGoals]);
  const nodes = useMemo<GoalNode[]>(() => activeGoals, [activeGoals]);
  const selectedGoal = activeGoals.find((goal) => goal.id === selectedId) ?? null;
  const links = useMemo<GoalLink[]>(() => {
    const semanticLinks = getRelationshipLinks(graphQuery.data, nodeIds);
    if (semanticLinks.length > 0) {
      return semanticLinks;
    }

    if (activeGoals.length < 2) {
      return [];
    }

    return activeGoals.slice(1).map((goal) => ({
      source: activeGoals[0].id,
      target: goal.id,
    }));
  }, [activeGoals, graphQuery.data, nodeIds]);
  const hasGraph = activeGoals.length > 0;
  const brandSoftColor = useMemo(() => readThemeColor('--brand-soft', '#dde9ee'), []);
  const brandColor = useMemo(() => readThemeColor('--brand', '#193a47'), []);
  const canvasWidth = Math.max(canvasSize.width, 320);
  const canvasHeight = Math.max(canvasSize.height, DEFAULT_GRAPH_HEIGHT);
  const setCanvasContainerRef = useCallback((node: HTMLDivElement | null) => {
    setCanvasContainer(node);
  }, []);

  useEffect(() => {
    if (!canvasContainer) {
      setCanvasSize((current) => {
        if (current.width === 0 && current.height === DEFAULT_GRAPH_HEIGHT) {
          return current;
        }

        return { width: 0, height: DEFAULT_GRAPH_HEIGHT };
      });
      return;
    }

    const updateSize = () => {
      const nextWidth = canvasContainer.clientWidth;
      const nextHeight = canvasContainer.clientHeight;
      setCanvasSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }

        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => {
        window.removeEventListener('resize', updateSize);
      };
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(canvasContainer);

    return () => {
      observer.disconnect();
    };
  }, [canvasContainer]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    if (!nodeIds.has(selectedId)) {
      setSelectedId(null);
    }
  }, [nodeIds, selectedId]);

  const fitGraphToView = useCallback(() => {
    if (!forceGraphRef.current || nodes.length === 0) {
      return;
    }

    try {
      forceGraphRef.current.zoomToFit(FIT_TO_VIEW_DURATION_MS, FIT_TO_VIEW_PADDING_PX);
    } catch {
      // Ignore transient graph engine state issues and retry on next change.
    }
  }, [nodes.length]);

  useEffect(() => {
    if (canvasSize.width === 0 || nodes.length === 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      fitGraphToView();
    }, 120);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [canvasSize.width, fitGraphToView, links.length, nodes.length]);

  return (
    <div className="split-layout">
      <section className="graph-canvas">
        <div className="graph-legend">
          <span className="tag">Goals</span>
          <span className="tag">Tasks</span>
          <span className="tag">Notes</span>
        </div>
        <p className="graph-helper muted">
          Links reflect goal relationships when available. If relationship data is missing, a simple
          starter layout is shown.
        </p>

        {usingMockRuntime ? (
          <ErrorBanner message="Mock data mode is active. This view is not reading your live Traycer graph. Start the desktop app in Tauri runtime to see real progress." />
        ) : null}

        {graphQuery.isLoading ? <Spinner label="Rendering graph..." /> : null}
        {!graphQuery.isLoading && graphQuery.error ? <ErrorBanner message="Unable to load graph summary." /> : null}
        {!graphQuery.isLoading && !graphQuery.error && !hasGraph ? (
          <p className="muted">No active goals in your graph.</p>
        ) : null}

        {!graphQuery.isLoading && !graphQuery.error && hasGraph ? (
          <div className="graph-viewport" ref={setCanvasContainerRef}>
            <ForceGraph2D
              ref={forceGraphRef}
              graphData={{ nodes, links }}
              width={canvasWidth}
              height={canvasHeight}
              backgroundColor="rgba(255,255,255,0)"
              nodeRelSize={8}
              minZoom={MIN_GRAPH_ZOOM}
              maxZoom={MAX_GRAPH_ZOOM}
              onEngineStop={fitGraphToView}
              nodeLabel={(node) => {
                const cast = node as GoalNode;
                return `${cast.label} (${cast.completedTasks}/${cast.totalTasks} complete)`;
              }}
              linkColor={() => '#c5d5dc'}
              onNodeClick={(node) => {
                const cast = node as GoalNode;
                if (!cast.id) {
                  return;
                }

                setSelectedId((current) => (current === cast.id ? null : cast.id));
              }}
              nodeCanvasObject={(node, ctx, globalScale) => {
                const cast = node as GoalNode;
                const isSelected = selectedId === cast.id;
                const label = cast.label;
                const completionRatio = getCompletionRatio(cast.completedTasks, cast.totalTasks);
                const safeScale = Math.max(globalScale, 0.01);
                const fontSize = 12 / safeScale;
                const labelPadding = 8 / safeScale;
                const baseRadius = getNodeRadius(cast.totalTasks);
                const dotRadius = baseRadius / safeScale;
                const ringRadius = (baseRadius + SELECTED_NODE_RING_WIDTH) / safeScale;
                const textX = (node.x ?? 0) + dotRadius + 8 / safeScale;
                const textY = node.y ?? 0;
                const progressColor = interpolateColor(brandSoftColor, brandColor, completionRatio);

                ctx.font = `${fontSize}px "IBM Plex Sans", sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                const textWidth = ctx.measureText(label).width;
                const textBoxX = textX - labelPadding;
                const textBoxY = textY - fontSize / 2 - labelPadding / 2;
                const textBoxWidth = textWidth + labelPadding * 2;
                const textBoxHeight = fontSize + labelPadding;

                ctx.fillStyle = '#f6fbfd';
                ctx.strokeStyle = isSelected ? '#193a47' : '#bfd0d8';
                ctx.lineWidth = isSelected ? 2 / safeScale : 1 / safeScale;
                ctx.beginPath();
                if (typeof ctx.roundRect === 'function') {
                  ctx.roundRect(textBoxX, textBoxY, textBoxWidth, textBoxHeight, 6 / safeScale);
                } else {
                  ctx.rect(textBoxX, textBoxY, textBoxWidth, textBoxHeight);
                }
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = progressColor;
                ctx.beginPath();
                ctx.arc(node.x ?? 0, node.y ?? 0, dotRadius, 0, 2 * Math.PI);
                ctx.fill();

                if (isSelected) {
                  ctx.strokeStyle = brandColor;
                  ctx.lineWidth = 2 / safeScale;
                  ctx.beginPath();
                  ctx.arc(node.x ?? 0, node.y ?? 0, ringRadius, 0, 2 * Math.PI);
                  ctx.stroke();
                }

                ctx.fillStyle = '#1f2c33';
                ctx.fillText(label, textX, textY);
              }}
            />
          </div>
        ) : null}
      </section>

      <aside className="detail-panel">
        <h3>Graph Snapshot</h3>
        <p>
          Goals: <strong>{graphQuery.data?.totalGoals ?? 0}</strong>
        </p>
        <p>
          Plans: <strong>{graphQuery.data?.totalPlans ?? 0}</strong>
        </p>
        {!graphQuery.isLoading && !graphQuery.error && selectedGoal ? (
          <div className="node-detail">
            {(() => {
              const progress = getProgressValues(selectedGoal.completedTasks, selectedGoal.totalTasks);
              return (
                <>
                  <h4>{selectedGoal.title ?? selectedGoal.id}</h4>
                  <p>
                    Progress: <strong>{selectedGoal.completedTasks}</strong> / <strong>{selectedGoal.totalTasks}</strong>{' '}
                    tasks complete ({progress.percent}%)
                  </p>
                  <div
                    className="progress-bar-track"
                    role="progressbar"
                    aria-valuenow={progress.ariaNow}
                    aria-valuemax={progress.ariaMax}
                  >
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${progress.percent}%`,
                      }}
                    />
                  </div>
                </>
              );
            })()}
          </div>
        ) : !graphQuery.isLoading && !graphQuery.error ? (
          <p className="muted">Click a node to inspect progress details shown in this panel.</p>
        ) : null}
      </aside>
    </div>
  );
}
