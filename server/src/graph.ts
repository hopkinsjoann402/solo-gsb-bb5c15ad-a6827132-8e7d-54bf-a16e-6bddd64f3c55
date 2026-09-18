export interface EdgeLike {
  fromId: string;
  toId: string;
}

/**
 * 沿有向边方向，BFS 寻找 start → goal 的一条路径。
 * 返回包含两端点的节点 id 数组；不可达时返回 null。
 */
export function findPath(edges: EdgeLike[], start: string, goal: string): string[] | null {
  if (start === goal) return [start];
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.fromId);
    if (list) list.push(e.toId);
    else adj.set(e.fromId, [e.toId]);
  }
  const prev = new Map<string, string | null>([[start, null]]);
  const queue: string[] = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nxt of adj.get(cur) ?? []) {
      if (prev.has(nxt)) continue;
      prev.set(nxt, cur);
      if (nxt === goal) {
        const path = [goal];
        let p = prev.get(goal)!;
        while (p !== null) {
          path.unshift(p);
          p = prev.get(p)!;
        }
        return path;
      }
      queue.push(nxt);
    }
  }
  return null;
}

/**
 * 校验「新增一条 fromId → toId 的边」是否会成环。
 * 若成环，返回完整闭环节点序列 [fromId, toId, …, fromId]
 * （首条为待保存的新边，其余为图中已有边）；否则返回 null。
 */
export function cycleAfterAdding(edges: EdgeLike[], newEdge: EdgeLike): string[] | null {
  if (newEdge.fromId === newEdge.toId) return [newEdge.fromId, newEdge.fromId];
  const back = findPath(edges, newEdge.toId, newEdge.fromId);
  if (!back) return null;
  return [newEdge.fromId, ...back];
}

/**
 * Kahn 拓扑排序 + 最长路径分层：level(n) = max(level(前置)) + 1。
 * 返回每个节点的层级（0 起）；若图中有环则返回 null。
 */
export function topoLevels(ids: string[], edges: EdgeLike[]): Record<string, number> | null {
  const indeg = new Map<string, number>();
  const level = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of ids) {
    indeg.set(id, 0);
    level.set(id, 0);
    adj.set(id, []);
  }
  for (const e of edges) {
    if (!indeg.has(e.fromId) || !indeg.has(e.toId)) continue;
    indeg.set(e.toId, indeg.get(e.toId)! + 1);
    adj.get(e.fromId)!.push(e.toId);
  }
  const queue = ids.filter((id) => indeg.get(id) === 0);
  let visited = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    visited++;
    for (const nxt of adj.get(cur)!) {
      level.set(nxt, Math.max(level.get(nxt)!, level.get(cur)! + 1));
      indeg.set(nxt, indeg.get(nxt)! - 1);
      if (indeg.get(nxt) === 0) queue.push(nxt);
    }
  }
  if (visited !== ids.length) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of level) out[k] = v;
  return out;
}

/**
 * 在已有图中寻找一个环（用于导入快照校验）。
 * 返回闭环节点序列 [n, …, n]；无环返回 null。
 */
export function findCycle(ids: string[], edges: EdgeLike[]): string[] | null {
  const adj = new Map<string, string[]>();
  for (const id of ids) adj.set(id, []);
  for (const e of edges) {
    if (adj.has(e.fromId) && adj.has(e.toId)) adj.get(e.fromId)!.push(e.toId);
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(ids.map((id) => [id, WHITE]));
  const parent = new Map<string, string | null>();

  for (const root of ids) {
    if (color.get(root) !== WHITE) continue;
    color.set(root, GRAY);
    parent.set(root, null);
    const stack: Array<[string, Iterator<string>]> = [[root, (adj.get(root) ?? [])[Symbol.iterator]()]];
    while (stack.length > 0) {
      const [node, it] = stack[stack.length - 1];
      const next = it.next();
      if (next.done) {
        color.set(node, BLACK);
        stack.pop();
        continue;
      }
      const n = next.value as string;
      if (color.get(n) === GRAY) {
        // 发现回边 node → n：沿父链回溯出完整闭环 n → … → node → n
        const cycle = [n];
        let cur: string = node;
        while (cur !== n) {
          cycle.unshift(cur);
          cur = parent.get(cur)!;
        }
        cycle.unshift(n);
        return cycle;
      }
      if (color.get(n) === WHITE) {
        color.set(n, GRAY);
        parent.set(n, node);
        stack.push([n, (adj.get(n) ?? [])[Symbol.iterator]()]);
      }
    }
  }
  return null;
}
