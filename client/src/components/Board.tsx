import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Conflict } from '../App';
import type { Evidence, GraphState } from '../types';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BoardProps {
  state: GraphState;
  conflict: Conflict | null;
  linkFrom: string | null;
  onStartLink: (id: string) => void;
  onCancelLink: () => void;
  onConnect: (fromId: string, toId: string) => void;
  onEdit: (ev: Evidence) => void;
  onDelete: (ev: Evidence) => void;
  onDeleteEdge: (id: number) => void;
}

const LEVEL_HINTS = ['无前置约束 · 最先发生', '需等待前一层完成', '需等待前两层完成'];

function curve(s: Rect, t: Rect): string {
  const x1 = s.x + s.w;
  const y1 = s.y + s.h / 2;
  const x2 = t.x;
  const y2 = t.y + t.h / 2;
  const dx = Math.max(36, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
}

function sameRects(a: Record<string, Rect>, b: Record<string, Rect>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    const r1 = a[k];
    const r2 = b[k];
    if (!r2) return false;
    if (Math.abs(r1.x - r2.x) > 0.5 || Math.abs(r1.y - r2.y) > 0.5 || Math.abs(r1.w - r2.w) > 0.5 || Math.abs(r1.h - r2.h) > 0.5) {
      return false;
    }
  }
  return true;
}

function fmtTime(iso: string | null): string | null {
  if (!iso) return null;
  return iso.replace('T', ' ').slice(0, 16);
}

export default function Board(props: BoardProps) {
  const { state, conflict, linkFrom } = props;
  const boardRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, Rect>>({});
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<{ fromId: string; x: number; y: number; moved: boolean } | null>(null);

  const byId = useMemo(() => new Map(state.evidence.map((e) => [e.id, e])), [state.evidence]);

  const columns = useMemo(() => {
    const cols: Evidence[][] = Array.from({ length: Math.max(state.levelCount, 1) }, () => []);
    for (const ev of state.evidence) {
      const lv = state.levels[ev.id] ?? 0;
      (cols[lv] ?? cols[0]).push(ev);
    }
    for (const col of cols) {
      col.sort((a, b) => (a.occurredAt ?? '').localeCompare(b.occurredAt ?? '') || a.title.localeCompare(b.title, 'zh'));
    }
    return cols;
  }, [state]);

  const conflictNodes = useMemo(() => new Set(conflict?.cycle ?? []), [conflict]);
  const conflictEdgeKeys = useMemo(() => {
    const s = new Set<string>();
    if (conflict) {
      // cycle = [尝试的起点, 尝试的终点, …, 起点]；跳过首对（那是被拒绝的新边），其余为图中已有边
      for (let i = 1; i < conflict.cycle.length - 1; i++) {
        s.add(`${conflict.cycle[i]}->${conflict.cycle[i + 1]}`);
      }
    }
    return s;
  }, [conflict]);
  const attempted = conflict && conflict.cycle.length >= 2 ? { from: conflict.cycle[0], to: conflict.cycle[1] } : null;

  /* 测量卡片位置，用于绘制 SVG 连线 */
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const measure = () => {
      const bb = board.getBoundingClientRect();
      const next: Record<string, Rect> = {};
      board.querySelectorAll<HTMLElement>('[data-card-id]').forEach((el) => {
        const r = el.getBoundingClientRect();
        next[el.dataset.cardId!] = {
          x: r.left - bb.left + board.scrollLeft,
          y: r.top - bb.top + board.scrollTop,
          w: r.width,
          h: r.height,
        };
      });
      setPositions((prev) => (sameRects(prev, next) ? prev : next));
      setSvgSize((prev) => {
        const w = board.scrollWidth;
        const h = board.scrollHeight;
        return prev.w === w && prev.h === h ? prev : { w, h };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(board);
    board.querySelectorAll('[data-card-id]').forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [state, conflict, linkFrom]);

  const toBoardPoint = (e: ReactPointerEvent) => {
    const board = boardRef.current!;
    const bb = board.getBoundingClientRect();
    return { x: e.clientX - bb.left + board.scrollLeft, y: e.clientY - bb.top + board.scrollTop };
  };

  const startLinkDrag = (e: ReactPointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    boardRef.current?.setPointerCapture(e.pointerId);
    const p = toBoardPoint(e);
    setDrag({ fromId: id, x: p.x, y: p.y, moved: false });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const p = toBoardPoint(e);
    setDrag((d) => (d ? { ...d, x: p.x, y: p.y, moved: true } : d));
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!drag) return;
    const { fromId, moved } = drag;
    setDrag(null);
    if (moved) {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-card-id]');
      const targetId = el?.getAttribute('data-card-id');
      if (targetId && targetId !== fromId) props.onConnect(fromId, targetId);
    } else {
      // 原地点击：进入/退出连线模式
      if (linkFrom === fromId) props.onCancelLink();
      else props.onStartLink(fromId);
    }
  };

  const onCardClick = (ev: Evidence) => {
    if (!linkFrom) return;
    if (linkFrom === ev.id) props.onCancelLink();
    else props.onConnect(linkFrom, ev.id);
  };

  const dragSource = drag ? positions[drag.fromId] : undefined;

  if (state.evidence.length === 0) {
    return (
      <section className="board-empty">
        <p>还没有证据卡片</p>
        <p className="muted">点击「新增证据」创建第一张卡片，或「载入示例」查看演示事故。</p>
      </section>
    );
  }

  return (
    <section className="board" ref={boardRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <svg className="edge-layer" width={svgSize.w} height={svgSize.h} aria-hidden>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#8b93ff" />
          </marker>
          <marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#ff5c6c" />
          </marker>
        </defs>

        {state.edges.map((e) => {
          const s = positions[e.fromId];
          const t = positions[e.toId];
          if (!s || !t) return null;
          const isConflict = conflictEdgeKeys.has(`${e.fromId}->${e.toId}`);
          const d = curve(s, t);
          return (
            <g key={e.id} className={`edge${isConflict ? ' conflict' : ''}`} onClick={() => props.onDeleteEdge(e.id)}>
              <title>{`${byId.get(e.fromId)?.title ?? ''} 必须早于 ${byId.get(e.toId)?.title ?? ''}（点击删除）`}</title>
              <path className="edge-hit" d={d} />
              <path className="edge-line" d={d} markerEnd={`url(#${isConflict ? 'arrow-red' : 'arrow'})`} />
            </g>
          );
        })}

        {attempted && positions[attempted.from] && positions[attempted.to] && (
          <path className="edge-attempted" d={curve(positions[attempted.from], positions[attempted.to])} markerEnd="url(#arrow-red)" />
        )}

        {drag && dragSource && (
          <line
            className="edge-dragging"
            x1={dragSource.x + dragSource.w}
            y1={dragSource.y + dragSource.h / 2}
            x2={drag.x}
            y2={drag.y}
          />
        )}
      </svg>

      <div className="columns">
        {columns.map((col, i) => (
          <div className="column" key={i}>
            <div className="column-header">
              <span className="column-title">层级 {i + 1}</span>
              <span className="column-hint">{LEVEL_HINTS[i] ?? `需等待前 ${i} 层完成`}</span>
            </div>
            {col.map((ev) => {
              const inConflict = conflictNodes.has(ev.id);
              const isSource = linkFrom === ev.id;
              const isTarget = linkFrom !== null && linkFrom !== ev.id;
              return (
                <article
                  key={ev.id}
                  data-card-id={ev.id}
                  className={[
                    'card',
                    inConflict ? 'in-conflict' : '',
                    isSource ? 'link-source' : '',
                    isTarget ? 'link-target' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onCardClick(ev)}
                >
                  <h3 className="card-title">{ev.title}</h3>
                  <div className="card-meta">
                    {fmtTime(ev.occurredAt) && <span className="chip">🕒 {fmtTime(ev.occurredAt)}</span>}
                    {ev.source && <span className="chip">来源 · {ev.source}</span>}
                  </div>
                  {ev.description && <p className="card-desc">{ev.description}</p>}
                  <div className="card-actions">
                    <button
                      className="btn small"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onEdit(ev);
                      }}
                    >
                      编辑
                    </button>
                    <button
                      className="btn small danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onDelete(ev);
                      }}
                    >
                      删除
                    </button>
                    <button
                      className={`btn small link${isSource ? ' active' : ''}`}
                      title="拖拽到另一张卡片，或点击后再点目标卡片"
                      onPointerDown={(e) => startLinkDrag(e, ev.id)}
                    >
                      ⇢ 连线
                    </button>
                  </div>
                  {isTarget && <div className="target-hint">点击：使「{byId.get(linkFrom!)?.title}」必须早于本卡</div>}
                </article>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
