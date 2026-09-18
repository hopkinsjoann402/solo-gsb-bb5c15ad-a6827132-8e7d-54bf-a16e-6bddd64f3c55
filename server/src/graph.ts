/**
 * 有向图工具：环检测与拓扑分层。
 * 语义：边 from -> to 表示「from 必须早于 to」。
 */

export interface GraphEdge {
  from: string;
  to: string;
}

function buildAdjacency(edges: GraphEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.from);
    if (list) list.push(e.to);
    else adj.set(e.from, [e.to]);
  }
  return adj;
}

/**
 * 判断新增边 from -> to 是否会成环。
 * 若成环，返回完整闭环节点序列（首尾相同，如 [A, B, C, A]）；否则返回 null。
 *
 * 原理：新边 from->to 成环，当且仅当现有图中已存在 to ⇢ from 的路径。
 */
export function findCycleAfterAdd(
  edges: GraphEdge[],
  from: string,
  to: string
): string[] | null {
  if (from === to) return [from, from];

  const adj = buildAdjacency(edges);
  const parent = new Map<string, string>();
  const visited = new Set<string>([to]);
  const stack: string[] = [to];

  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === from) {
      // 还原 to ⇢ from 的路径，再补上新边 from -> to 形成完整闭环
      const path: string[] = [from];
      let node = from;
      while (node !== to) {
        node = parent.get(node)!;
        path.unshift(node);
      }
      // path = [to, ..., from]，闭环 = from -> to -> ... -> from
      return [from, ...path];
    }
    for (const next of adj.get(cur) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        parent.set(next, cur);
        stack.push(next);
      }
    }
  }
  return null;
}

/**
 * 拓扑分层（Kahn + 最长路径分层）：
 * level(v) = 0（无前置依赖）；否则 level(v) = 1 + max(level(前置节点))。
 * 保证任意边 from->to 都有 level(to) > level(from)，可直接作为时间线列号。
 * 调用前提：图无环。若意外存在环，剩余节点归入第 0 层（防御性兜底）。
 */
export function computeLevels(
  nodeIds: string[],
  edges: GraphEdge[]
): Record<string, number> {
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) {
    indegree.set(id, 0);
    adj.set(id, []);
  }
  for (const e of edges) {
    if (!indegree.has(e.from) || !indegree.has(e.to)) continue;
    indegree.set(e.to, indegree.get(e.to)! + 1);
    adj.get(e.from)!.push(e.to);
  }

  const level = new Map<string, number>();
  const remaining = new Map(indegree);
  const queue: string[] = [];
  for (const id of nodeIds) {
    if (remaining.get(id) === 0) {
      level.set(id, 0);
      queue.push(id);
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curLevel = level.get(cur) ?? 0;
    for (const next of adj.get(cur) ?? []) {
      level.set(next, Math.max(level.get(next) ?? 0, curLevel + 1));
      remaining.set(next, remaining.get(next)! - 1);
      if (remaining.get(next) === 0) queue.push(next);
    }
  }
  for (const id of nodeIds) {
    if (!level.has(id)) level.set(id, 0);
  }

  const result: Record<string, number> = {};
  for (const [id, lv] of level) result[id] = lv;
  return result;
}

/**
 * 检测整个图是否存在环（用于导入快照校验）。
 * 存在则返回一个完整闭环（首尾相同），否则返回 null。
 */
export function findAnyCycle(
  nodeIds: string[],
  edges: GraphEdge[]
): string[] | null {
  const adj = buildAdjacency(edges);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>(nodeIds.map((id) => [id, WHITE]));
  const stack: string[] = [];

  const dfs = (node: string): string[] | null => {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of adj.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const idx = stack.indexOf(next);
        return [...stack.slice(idx), next];
      }
      if (c === WHITE) {
        const found = dfs(next);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return null;
  };

  for (const id of nodeIds) {
    if (color.get(id) === WHITE) {
      const found = dfs(id);
      if (found) return found;
    }
  }
  return null;
}
