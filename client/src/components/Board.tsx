import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BoardState, Conflict, Evidence } from '../types';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BoardProps {
  state: BoardState;
  conflict: Conflict | null;
  connectingFrom: string | null;
  selectedEdgeId: string | null;
  onStartConnect: (id: string) => void;
  onCancelConnect: () => void;
  onCompleteConnect: (targetId: string) => void;
  onEditCard: (ev: Evidence) => void;
  onDeleteCard: (ev: Evidence) => void;
  onSelectEdge: (id: string | null) => void;
  onDeleteEdge: (id: string) => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return '未标注时间';
  return iso.replace('T', ' ');
}

function samePositions(a: Record<string, Rect>, b: Record<string, Rect>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => {
    const ra = a[k];
    const rb = b[k];
    return (
      rb &&
      Math.abs(ra.x - rb.x) < 0.5 &&
      Math.abs(ra.y - rb.y) < 0.5 &&
      Math.abs(ra.w - rb.w) < 0.5 &&
      Math.abs(ra.h - rb.h) < 0.5
    );
  });
}

export default function Board(props: BoardProps) {
  const { state, conflict, connectingFrom, selectedEdgeId } = props;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [positions, setPositions] = useState<Record<string, Rect>>({});
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

  const byId = useMemo(() => new Map(state.evidence.map((e) => [e.id, e])), [state.evidence]);

  /** 按拓扑层级分列，列内按发生时间排序 */
  const columns = useMemo(() => {
    const byLevel = new Map<number, Evidence[]>();
    for (const ev of state.evidence) {
      const lv = state.levels[ev.id] ?? 0;
      const list = byLevel.get(lv);
      if (list) list.push(ev);
      else byLevel.set(lv, [ev]);
    }
    const sorted = [...byLevel.entries()].sort((a, b) => a[0] - b[0]);
    for (const [, list] of sorted) {
      list.sort(
        (a, b) =>
          (a.occurred_at ?? '').localeCompare(b.occurred_at ?? '') ||
          a.title.localeCompare(b.title, 'zh-CN')
      );
    }
    return sorted;
  }, [state]);

  /* ---------- 冲突闭环 ---------- */
  const conflictNodes = useMemo(() => new Set(conflict?.cycle ?? []), [conflict]);
  const conflictPairs = useMemo(() => {
    const set = new Set<string>();
    if (conflict) {
      for (let i = 0; i < conflict.cycle.length - 1; i++) {
        set.add(`${conflict.cycle[i]}->${conflict.cycle[i + 1]}`);
      }
    }
    return set;
  }, [conflict]);

  /* ---------- 测量卡片位置用于绘制连线 ---------- */
  const measure = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const wrect = wrapper.getBoundingClientRect();
    const next: Record<string, Rect> = {};
    cardRefs.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      next[id] = { x: r.left - wrect.left, y: r.top - wrect.top, w: r.width, h: r.height };
    });
    setPositions((prev) => (samePositions(prev, next) ? prev : next));
  }, []);

  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  /* ---------- 几何 ---------- */
  const outPoint = (id: string) => {
    const r = positions[id];
    return r ? { x: r.x + r.w, y: r.y + r.h / 2 } : null;
  };
  const inPoint = (id: string) => {
    const r = positions[id];
    return r ? { x: r.x, y: r.y + r.h / 2 } : null;
  };
  const edgePath = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = Math.max(48, Math.abs(b.x - a.x) / 2);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  };
  const midPoint = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = Math.max(48, Math.abs(b.x - a.x) / 2);
    const c1 = { x: a.x + dx, y: a.y };
    const c2 = { x: b.x - dx, y: b.y };
    // 三次贝塞尔 t=0.5
    return {
      x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8,
      y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8,
    };
  };

  const handleWrapperClick = () => {
    if (connectingFrom) props.onCancelConnect();
    else if (selectedEdgeId) props.onSelectEdge(null);
  };

  const selectedEdge = state.edges.find((e) => e.id === selectedEdgeId) ?? null;
  const selectedMid =
    selectedEdge && positions[selectedEdge.from_id] && positions[selectedEdge.to_id]
      ? midPoint(outPoint(selectedEdge.from_id)!, inPoint(selectedEdge.to_id)!)
      : null;

  if (state.evidence.length === 0) {
    return (
      <div className="empty-state">
        <p>还没有证据卡片。</p>
        <p>点击右上角「＋ 新建证据」开始编排，或「✦ 载入示例」查看示例事故。</p>
      </div>
    );
  }

  return (
    <div className="board-scroll">
      <div
        ref={wrapperRef}
        className={`board ${connectingFrom ? 'is-connecting' : ''}`}
        onClick={handleWrapperClick}
        onMouseMove={(e) => {
          if (!connectingFrom || !wrapperRef.current) return;
          const r = wrapperRef.current.getBoundingClientRect();
          setMouse({ x: e.clientX - r.left, y: e.clientY - r.top });
        }}
      >
        {/* 连线层 */}
        <svg className="edge-layer">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#7c8cf8" />
            </marker>
            <marker id="arrow-conflict" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#f87171" />
            </marker>
          </defs>

          {state.edges.map((edge) => {
            const a = outPoint(edge.from_id);
            const b = inPoint(edge.to_id);
            if (!a || !b) return null;
            const isConflict = conflictPairs.has(`${edge.from_id}->${edge.to_id}`);
            const isSelected = edge.id === selectedEdgeId;
            const fromTitle = byId.get(edge.from_id)?.title ?? '?';
            const toTitle = byId.get(edge.to_id)?.title ?? '?';
            return (
              <g key={edge.id}>
                <path
                  className={`edge-path ${isConflict ? 'conflict' : ''} ${isSelected ? 'selected' : ''}`}
                  d={edgePath(a, b)}
                  markerEnd={isConflict ? 'url(#arrow-conflict)' : 'url(#arrow)'}
                />
                <path
                  className="edge-hit"
                  d={edgePath(a, b)}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onSelectEdge(isSelected ? null : edge.id);
                  }}
                >
                  <title>「{fromTitle}」必须早于「{toTitle}」——点击可选中并删除</title>
                </path>
              </g>
            );
          })}

          {/* 被拒绝的连线（未保存，用红色虚线画出） */}
          {conflict && (() => {
            const [f, t] = conflict.rejected;
            const a = outPoint(f);
            const b = inPoint(t);
            if (!a || !b) return null;
            return <path className="edge-path rejected" d={edgePath(a, b)} markerEnd="url(#arrow-conflict)" />;
          })()}

          {/* 正在拖拽的临时连线 */}
          {connectingFrom && mouse && outPoint(connectingFrom) && (
            <path className="edge-path pending" d={edgePath(outPoint(connectingFrom)!, mouse)} />
          )}
        </svg>

        {/* 选中连线的删除按钮 */}
        {selectedEdge && selectedMid && (
          <button
            className="edge-delete"
            style={{ left: selectedMid.x, top: selectedMid.y }}
            onClick={(e) => {
              e.stopPropagation();
              props.onDeleteEdge(selectedEdge.id);
            }}
          >
            删除关系 ×
          </button>
        )}

        {/* 层级列 */}
        {columns.map(([level, list]) => (
          <div className="level-column" key={level}>
            <div className="level-header">
              <span className="level-badge">第 {level + 1} 层</span>
              <span className="level-desc">
                {level === 0 ? '起点 · 无前置依赖' : `依赖第 ${level} 层及之前`}
              </span>
            </div>
            {list.map((ev) => {
              const isConflictNode = conflictNodes.has(ev.id);
              const isSource = connectingFrom === ev.id;
              return (
                <div
                  key={ev.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(ev.id, el);
                    else cardRefs.current.delete(ev.id);
                  }}
                  className={`card ${isConflictNode ? 'conflict' : ''} ${isSource ? 'connect-source' : ''} ${
                    connectingFrom && !isSource ? 'connect-target' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (connectingFrom) props.onCompleteConnect(ev.id);
                  }}
                >
                  <div className="card-head">
                    <span className="card-time">{formatTime(ev.occurred_at)}</span>
                    <span className="card-level">L{level + 1}</span>
                  </div>
                  <h3 className="card-title">{ev.title}</h3>
                  {ev.description && <p className="card-desc">{ev.description}</p>}
                  <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="icon-btn connect-btn"
                      title="从该证据引出「必须早于」连线"
                      onClick={() =>
                        isSource ? props.onCancelConnect() : props.onStartConnect(ev.id)
                      }
                    >
                      {isSource ? '取消' : '⇢ 连线'}
                    </button>
                    <span className="spacer" />
                    <button className="icon-btn" title="编辑" onClick={() => props.onEditCard(ev)}>
                      ✎
                    </button>
                    <button
                      className="icon-btn danger"
                      title="删除"
                      onClick={() => props.onDeleteCard(ev)}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* 冲突说明浮层 */}
        {conflict && (
          <div className="conflict-banner">
            ⚠ 连线被拒绝：将形成时间环
            <strong>
              {conflict.cycle.map((id) => byId.get(id)?.title ?? id).join(' → ')}
            </strong>
          </div>
        )}
      </div>
    </div>
  );
}
