import type { Span } from "@cloudgrid/ui-contracts";

export const MISSING_PARENT_GROUP_ID = "__cloudgrid_missing_parent__";

export type TraceTreeRowKind = "span" | "missing-parent-group";

export interface TraceTreeIndexes {
  spansById: Map<string, Span>;
  childrenByParentId: Map<string, string[]>;
  rootSpanIds: string[];
  missingParentSpanIds: string[];
  siblingIndexById: Map<string, number>;
  traceStartedAtMs: number;
  traceDurationMs: number;
  traceStartedAtNano: bigint | null;
  traceDurationNano: bigint | null;
}

export interface BuildTraceTreeIndexesInput {
  spans: Span[];
  traceStartedAt: string;
  traceStartedAtUnixNano?: string | null | undefined;
  traceDurationNano?: string | null | undefined;
  traceDurationMs?: number | null | undefined;
  rootSpanIds?: readonly string[] | undefined;
  orphanSpanIds?: readonly string[] | undefined;
}

export interface TraceTreeFlattenInput {
  indexes: TraceTreeIndexes;
  expandedSpanIds: ReadonlySet<string>;
  selectedSpanId?: string | null | undefined;
  matchedSpanIds?: ReadonlySet<string> | undefined;
  filterVisibleSpanIds?: ReadonlySet<string> | undefined;
  criticalPathSpanIds?: ReadonlySet<string> | undefined;
  exactLogSpanIds?: ReadonlySet<string> | undefined;
}

export interface TraceTreeRow {
  kind: TraceTreeRowKind;
  rowId: string;
  spanId: string;
  span: Span | null;
  parentSpanId: string | null;
  depth: number;
  siblingIndex: number;
  childCount: number;
  isExpanded: boolean;
  hasVisibleChildren: boolean;
  isMutedAncestor: boolean;
  isSelected: boolean;
  isFocused: boolean;
  isCriticalPath: boolean;
  hasError: boolean;
  hasLogs: boolean;
  isMatch: boolean;
  startOffsetPercent: number;
  durationPercent: number;
}

export interface InitialExpandedSpanIdsInput {
  indexes: TraceTreeIndexes;
  selectedSpanId?: string | null | undefined;
  criticalPathSpanIds?: ReadonlySet<string> | undefined;
  errorSpanIds?: ReadonlySet<string> | undefined;
}

const minimumDurationPercent = 0.35;

function safeTime(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function safeUnixNano(value?: string | null) {
  if (!value || !/^[0-9]+$/.test(value)) {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function spanStartedAtNano(span: Span) {
  return safeUnixNano(span.startedAtUnixNano);
}

function spanDurationNano(span: Span) {
  return safeUnixNano(span.durationNano);
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function stableCompareSpans(
  spansById: Map<string, Span>,
  siblingIndexById: Map<string, number>,
  leftId: string,
  rightId: string,
) {
  const left = spansById.get(leftId);
  const right = spansById.get(rightId);
  const leftStartedAtNano = left ? spanStartedAtNano(left) : null;
  const rightStartedAtNano = right ? spanStartedAtNano(right) : null;
  if (
    leftStartedAtNano !== null &&
    rightStartedAtNano !== null &&
    leftStartedAtNano !== rightStartedAtNano
  ) {
    return leftStartedAtNano < rightStartedAtNano ? -1 : 1;
  }
  const leftStartedAt = left ? safeTime(left.startedAt) : 0;
  const rightStartedAt = right ? safeTime(right.startedAt) : 0;
  const startedDelta = leftStartedAt - rightStartedAt;

  if (startedDelta !== 0) {
    return startedDelta;
  }

  const siblingDelta =
    (siblingIndexById.get(leftId) ?? Number.MAX_SAFE_INTEGER) -
    (siblingIndexById.get(rightId) ?? Number.MAX_SAFE_INTEGER);

  if (siblingDelta !== 0) {
    return siblingDelta;
  }

  return leftId.localeCompare(rightId);
}

function uniqueExistingIds(ids: Iterable<string>, spansById: Map<string, Span>) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    if (!seen.has(id) && spansById.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }

  return result;
}

export function buildTraceTreeIndexes({
  spans,
  traceStartedAt,
  traceStartedAtUnixNano,
  traceDurationNano,
  traceDurationMs,
  rootSpanIds,
  orphanSpanIds,
}: BuildTraceTreeIndexesInput): TraceTreeIndexes {
  const spansById = new Map<string, Span>();
  const childrenByParentId = new Map<string, string[]>();
  const siblingIndexById = new Map<string, number>();
  const orphanSpanIdSet = new Set(orphanSpanIds ?? []);

  spans.forEach((span, index) => {
    spansById.set(span.id, span);
    siblingIndexById.set(span.id, index);
  });

  const explicitRootSpanIds = uniqueExistingIds(rootSpanIds ?? [], spansById);
  const explicitRootSet = new Set(explicitRootSpanIds);
  const missingParentSpanIds: string[] = [];
  const inferredRootSpanIds: string[] = [];

  for (const span of spans) {
    const parentSpanId = span.parentSpanId ?? null;
    const parentExists = parentSpanId ? spansById.has(parentSpanId) : false;
    const hasMissingParent =
      (parentSpanId !== null && !parentExists) || span.isOrphan || orphanSpanIdSet.has(span.id);

    if (hasMissingParent) {
      missingParentSpanIds.push(span.id);
      continue;
    }

    if (parentSpanId && parentExists) {
      const children = childrenByParentId.get(parentSpanId) ?? [];
      children.push(span.id);
      childrenByParentId.set(parentSpanId, children);
      continue;
    }

    if (!explicitRootSet.has(span.id)) {
      inferredRootSpanIds.push(span.id);
    }
  }

  for (const [parentSpanId, childSpanIds] of childrenByParentId) {
    childrenByParentId.set(
      parentSpanId,
      [...childSpanIds].sort((leftId, rightId) =>
        stableCompareSpans(spansById, siblingIndexById, leftId, rightId),
      ),
    );
  }

  const sortedExplicitRootSpanIds = [...explicitRootSpanIds].sort((leftId, rightId) =>
    stableCompareSpans(spansById, siblingIndexById, leftId, rightId),
  );
  const sortedInferredRootSpanIds = [...inferredRootSpanIds].sort((leftId, rightId) =>
    stableCompareSpans(spansById, siblingIndexById, leftId, rightId),
  );
  const sortedMissingParentSpanIds = [...missingParentSpanIds].sort((leftId, rightId) =>
    stableCompareSpans(spansById, siblingIndexById, leftId, rightId),
  );

  if (sortedMissingParentSpanIds.length > 0) {
    childrenByParentId.set(MISSING_PARENT_GROUP_ID, sortedMissingParentSpanIds);
  }

  const parsedTraceStartedAtNano = safeUnixNano(traceStartedAtUnixNano);
  const parsedTraceDurationNano = safeUnixNano(traceDurationNano);

  return {
    spansById,
    childrenByParentId,
    rootSpanIds: [...sortedExplicitRootSpanIds, ...sortedInferredRootSpanIds],
    missingParentSpanIds: sortedMissingParentSpanIds,
    siblingIndexById,
    traceStartedAtMs: safeTime(traceStartedAt),
    traceDurationMs: traceDurationMs && traceDurationMs > 0 ? traceDurationMs : 0,
    traceStartedAtNano: parsedTraceStartedAtNano,
    traceDurationNano:
      parsedTraceDurationNano && parsedTraceDurationNano > 0n ? parsedTraceDurationNano : null,
  };
}

export function getSpanAncestorIds(indexes: TraceTreeIndexes, spanId: string) {
  const ancestorIds: string[] = [];
  const visited = new Set<string>();
  let current = indexes.spansById.get(spanId);

  while (current?.parentSpanId && indexes.spansById.has(current.parentSpanId)) {
    const parentSpanId = current.parentSpanId;

    if (visited.has(parentSpanId)) {
      break;
    }

    visited.add(parentSpanId);
    ancestorIds.unshift(parentSpanId);
    current = indexes.spansById.get(parentSpanId);
  }

  return ancestorIds;
}

export function isDescendantOf(indexes: TraceTreeIndexes, spanId: string, ancestorSpanId: string) {
  let current = indexes.spansById.get(spanId);
  const visited = new Set<string>();

  while (current?.parentSpanId) {
    if (current.parentSpanId === ancestorSpanId) {
      return true;
    }

    if (visited.has(current.parentSpanId)) {
      return false;
    }

    visited.add(current.parentSpanId);
    current = indexes.spansById.get(current.parentSpanId);
  }

  return false;
}

export function buildInitialExpandedSpanIds({
  indexes,
  selectedSpanId,
  criticalPathSpanIds,
  errorSpanIds,
}: InitialExpandedSpanIdsInput) {
  const expandedSpanIds = new Set<string>();
  const addPath = (spanId: string) => {
    for (const ancestorSpanId of getSpanAncestorIds(indexes, spanId)) {
      expandedSpanIds.add(ancestorSpanId);
    }

    if ((indexes.childrenByParentId.get(spanId)?.length ?? 0) > 0) {
      expandedSpanIds.add(spanId);
    }
  };

  for (const rootSpanId of indexes.rootSpanIds) {
    if ((indexes.childrenByParentId.get(rootSpanId)?.length ?? 0) > 0) {
      expandedSpanIds.add(rootSpanId);
    }
  }

  if (indexes.missingParentSpanIds.length > 0) {
    expandedSpanIds.add(MISSING_PARENT_GROUP_ID);
  }

  if (selectedSpanId) {
    addPath(selectedSpanId);
  }

  for (const spanId of criticalPathSpanIds ?? []) {
    addPath(spanId);
  }

  for (const spanId of errorSpanIds ?? []) {
    addPath(spanId);
  }

  return expandedSpanIds;
}

export function expandSelectedSpanPath(
  expandedSpanIds: ReadonlySet<string>,
  indexes: TraceTreeIndexes,
  selectedSpanId?: string | null,
) {
  if (!selectedSpanId || !indexes.spansById.has(selectedSpanId)) {
    return expandedSpanIds instanceof Set ? expandedSpanIds : new Set(expandedSpanIds);
  }

  const next = new Set(expandedSpanIds);
  for (const ancestorSpanId of getSpanAncestorIds(indexes, selectedSpanId)) {
    next.add(ancestorSpanId);
  }

  if ((indexes.childrenByParentId.get(selectedSpanId)?.length ?? 0) > 0) {
    next.add(selectedSpanId);
  }

  if (indexes.missingParentSpanIds.includes(selectedSpanId)) {
    next.add(MISSING_PARENT_GROUP_ID);
  }

  return next;
}

export function getSpanStartOffsetPercent(indexes: TraceTreeIndexes, span: Span) {
  const startNano = spanStartedAtNano(span);
  if (
    indexes.traceStartedAtNano !== null &&
    indexes.traceDurationNano !== null &&
    startNano !== null
  ) {
    const offsetNano =
      startNano > indexes.traceStartedAtNano ? startNano - indexes.traceStartedAtNano : 0n;
    return clampPercent((Number(offsetNano) / Number(indexes.traceDurationNano)) * 100);
  }

  if (indexes.traceDurationMs <= 0) {
    return 0;
  }

  const offsetMs = safeTime(span.startedAt) - indexes.traceStartedAtMs;
  return clampPercent((offsetMs / indexes.traceDurationMs) * 100);
}

export function getSpanDurationPercent(indexes: TraceTreeIndexes, span: Span) {
  const durationNano = spanDurationNano(span);
  if (indexes.traceDurationNano !== null && durationNano !== null) {
    return Math.max(
      minimumDurationPercent,
      clampPercent((Number(durationNano) / Number(indexes.traceDurationNano)) * 100),
    );
  }

  if (indexes.traceDurationMs <= 0) {
    return minimumDurationPercent;
  }

  return Math.max(
    minimumDurationPercent,
    clampPercent((span.durationMs / indexes.traceDurationMs) * 100),
  );
}

function addAncestors(indexes: TraceTreeIndexes, spanId: string, visibleSpanIds: Set<string>) {
  for (const ancestorSpanId of getSpanAncestorIds(indexes, spanId)) {
    visibleSpanIds.add(ancestorSpanId);
  }
}

export function flattenTraceTree({
  indexes,
  expandedSpanIds,
  selectedSpanId,
  matchedSpanIds,
  filterVisibleSpanIds,
  criticalPathSpanIds,
  exactLogSpanIds,
}: TraceTreeFlattenInput) {
  const directVisibleSpanIds =
    filterVisibleSpanIds && filterVisibleSpanIds.size > 0
      ? new Set(filterVisibleSpanIds)
      : new Set(indexes.spansById.keys());
  const preservedSpanIds = new Set(directVisibleSpanIds);

  for (const spanId of directVisibleSpanIds) {
    addAncestors(indexes, spanId, preservedSpanIds);
  }

  for (const spanId of matchedSpanIds ?? []) {
    if (indexes.spansById.has(spanId)) {
      preservedSpanIds.add(spanId);
      addAncestors(indexes, spanId, preservedSpanIds);
    }
  }

  const rows: TraceTreeRow[] = [];
  const visitSpan = (spanId: string, depth: number, parentSpanId: string | null) => {
    const span = indexes.spansById.get(spanId);

    if (!span || !preservedSpanIds.has(spanId)) {
      return;
    }

    const childSpanIds = indexes.childrenByParentId.get(spanId) ?? [];
    const visibleChildSpanIds = childSpanIds.filter((childSpanId) =>
      preservedSpanIds.has(childSpanId),
    );
    const isExpanded = expandedSpanIds.has(spanId);

    rows.push({
      kind: "span",
      rowId: span.id,
      spanId: span.id,
      span,
      parentSpanId,
      depth,
      siblingIndex: indexes.siblingIndexById.get(span.id) ?? 0,
      childCount: childSpanIds.length,
      isExpanded,
      hasVisibleChildren: visibleChildSpanIds.length > 0,
      isMutedAncestor:
        filterVisibleSpanIds !== undefined &&
        filterVisibleSpanIds.size > 0 &&
        !filterVisibleSpanIds.has(span.id),
      isSelected: span.id === selectedSpanId,
      isFocused: false,
      isCriticalPath: criticalPathSpanIds?.has(span.id) ?? span.isCriticalPath,
      hasError: span.hasError,
      hasLogs: exactLogSpanIds?.has(span.id) ?? false,
      isMatch: matchedSpanIds?.has(span.id) ?? false,
      startOffsetPercent: getSpanStartOffsetPercent(indexes, span),
      durationPercent: getSpanDurationPercent(indexes, span),
    });

    if (!isExpanded) {
      return;
    }

    for (const childSpanId of visibleChildSpanIds) {
      visitSpan(childSpanId, depth + 1, span.id);
    }
  };

  for (const rootSpanId of indexes.rootSpanIds) {
    visitSpan(rootSpanId, 1, null);
  }

  const visibleMissingParentSpanIds = indexes.missingParentSpanIds.filter((spanId) =>
    preservedSpanIds.has(spanId),
  );

  if (visibleMissingParentSpanIds.length > 0) {
    const isExpanded = expandedSpanIds.has(MISSING_PARENT_GROUP_ID);

    rows.push({
      kind: "missing-parent-group",
      rowId: MISSING_PARENT_GROUP_ID,
      spanId: MISSING_PARENT_GROUP_ID,
      span: null,
      parentSpanId: null,
      depth: 1,
      siblingIndex: Number.MAX_SAFE_INTEGER,
      childCount: visibleMissingParentSpanIds.length,
      isExpanded,
      hasVisibleChildren: visibleMissingParentSpanIds.length > 0,
      isMutedAncestor: false,
      isSelected: false,
      isFocused: false,
      isCriticalPath: false,
      hasError: false,
      hasLogs: false,
      isMatch: false,
      startOffsetPercent: 0,
      durationPercent: 100,
    });

    if (isExpanded) {
      for (const spanId of visibleMissingParentSpanIds) {
        visitSpan(spanId, 2, MISSING_PARENT_GROUP_ID);
      }
    }
  }

  return rows;
}
