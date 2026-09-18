import express, { Request, Response } from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  db,
  allEvidence,
  allEdges,
  seedIfEmpty,
  loadSampleData,
  EvidenceRow,
} from './db';
import { findCycleAfterAdd, findAnyCycle, computeLevels } from './graph';

const PORT = Number(process.env.PORT || 8080);
const app = express();
app.use(express.json({ limit: '5mb' }));

seedIfEmpty();

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

function buildState() {
  const evidence = allEvidence();
  const edges = allEdges();
  const levels = computeLevels(
    evidence.map((e) => e.id),
    edges.map((e) => ({ from: e.from_id, to: e.to_id }))
  );
  return { evidence, edges, levels };
}

/* ------------------------------ 查询 ------------------------------ */

app.get('/api/state', (_req: Request, res: Response) => {
  res.json(buildState());
});

/* ------------------------------ 证据卡片 ------------------------------ */

app.post('/api/evidence', (req: Request, res: Response) => {
  const { title, description = '', occurred_at = null } = req.body ?? {};
  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ message: '标题不能为空' });
  }
  const id = newId();
  const ts = now();
  db.prepare(
    `INSERT INTO evidence (id, title, description, occurred_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, title.trim(), String(description ?? ''), occurred_at || null, ts, ts);
  res.status(201).json(buildState());
});

app.put('/api/evidence/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM evidence WHERE id = ?').get(id) as
    | EvidenceRow
    | undefined;
  if (!existing) return res.status(404).json({ message: '证据不存在' });

  const { title, description, occurred_at } = req.body ?? {};
  const nextTitle =
    title === undefined ? existing.title : String(title).trim();
  if (nextTitle === '') return res.status(400).json({ message: '标题不能为空' });
  const nextDesc =
    description === undefined ? existing.description : String(description ?? '');
  const nextOccurred =
    occurred_at === undefined ? existing.occurred_at : occurred_at || null;

  db.prepare(
    `UPDATE evidence SET title = ?, description = ?, occurred_at = ?, updated_at = ? WHERE id = ?`
  ).run(nextTitle, nextDesc, nextOccurred, now(), id);
  res.json(buildState());
});

app.delete('/api/evidence/:id', (req: Request, res: Response) => {
  const info = db.prepare('DELETE FROM evidence WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ message: '证据不存在' });
  res.json(buildState());
});

/* ------------------------------ 先后关系（连线） ------------------------------ */

app.post('/api/edges', (req: Request, res: Response) => {
  const { from, to } = req.body ?? {};
  if (typeof from !== 'string' || typeof to !== 'string') {
    return res.status(400).json({ message: '缺少 from / to 参数' });
  }
  if (from === to) {
    return res.status(409).json({ message: '证据不能关联到自身', cycle: [from, from] });
  }
  const ids = new Set(allEvidence().map((e) => e.id));
  if (!ids.has(from) || !ids.has(to)) {
    return res.status(404).json({ message: '关联的证据不存在' });
  }
  const edges = allEdges();
  if (edges.some((e) => e.from_id === from && e.to_id === to)) {
    return res.status(409).json({ message: '该先后关系已存在' });
  }

  // 核心校验：新增边是否会成环
  const cycle = findCycleAfterAdd(
    edges.map((e) => ({ from: e.from_id, to: e.to_id })),
    from,
    to
  );
  if (cycle) {
    return res.status(409).json({
      message: '该连线会形成时间环，已拒绝保存',
      cycle,
    });
  }

  db.prepare(
    'INSERT INTO edges (id, from_id, to_id, created_at) VALUES (?, ?, ?, ?)'
  ).run(newId(), from, to, now());
  res.status(201).json(buildState());
});

app.delete('/api/edges/:id', (req: Request, res: Response) => {
  const info = db.prepare('DELETE FROM edges WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ message: '关系不存在' });
  res.json(buildState());
});

/* ------------------------------ 导入 / 导出 / 示例 ------------------------------ */

app.get('/api/export', (_req: Request, res: Response) => {
  const snapshot = {
    app: 'evidence-chain-orchestrator',
    version: 1,
    exported_at: now(),
    evidence: allEvidence(),
    edges: allEdges(),
  };
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="evidence-snapshot-${Date.now()}.json"`
  );
  res.json(snapshot);
});

interface ImportEvidence {
  id: string;
  title: string;
  description?: string;
  occurred_at?: string | null;
}
interface ImportEdge {
  from_id: string;
  to_id: string;
}

app.post('/api/import', (req: Request, res: Response) => {
  const body = req.body ?? {};
  const evidence = body.evidence as ImportEvidence[] | undefined;
  const edges = body.edges as ImportEdge[] | undefined;
  if (!Array.isArray(evidence) || !Array.isArray(edges)) {
    return res.status(400).json({ message: '快照格式错误：需要 evidence 与 edges 数组' });
  }

  // 结构校验
  const ids = new Set<string>();
  for (const ev of evidence) {
    if (!ev || typeof ev.id !== 'string' || typeof ev.title !== 'string' || ev.title.trim() === '') {
      return res.status(400).json({ message: '快照格式错误：证据缺少 id 或 title' });
    }
    if (ids.has(ev.id)) {
      return res.status(400).json({ message: `快照格式错误：证据 id 重复（${ev.id}）` });
    }
    ids.add(ev.id);
  }
  const graphEdges: Array<{ from: string; to: string }> = [];
  for (const e of edges) {
    if (!e || typeof e.from_id !== 'string' || typeof e.to_id !== 'string') {
      return res.status(400).json({ message: '快照格式错误：关系缺少 from_id 或 to_id' });
    }
    if (!ids.has(e.from_id) || !ids.has(e.to_id)) {
      return res.status(400).json({ message: '快照格式错误：关系引用了不存在的证据' });
    }
    graphEdges.push({ from: e.from_id, to: e.to_id });
  }

  // 环校验：含环的快照整体拒绝
  const cycle = findAnyCycle([...ids], graphEdges);
  if (cycle) {
    return res.status(409).json({ message: '导入被拒绝：快照中存在时间环', cycle });
  }

  const ts = now();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM evidence').run();
    const insertEvidence = db.prepare(
      `INSERT INTO evidence (id, title, description, occurred_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const ev of evidence) {
      insertEvidence.run(
        ev.id,
        ev.title.trim(),
        String(ev.description ?? ''),
        ev.occurred_at || null,
        ts,
        ts
      );
    }
    const insertEdge = db.prepare(
      'INSERT INTO edges (id, from_id, to_id, created_at) VALUES (?, ?, ?, ?)'
    );
    for (const e of edges) insertEdge.run(newId(), e.from_id, e.to_id, ts);
  });
  tx();
  res.json(buildState());
});

app.post('/api/seed', (_req: Request, res: Response) => {
  loadSampleData();
  res.json(buildState());
});

/* ------------------------------ 静态资源（生产模式） ------------------------------ */

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req: Request, res: Response, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(`[evidence-chain] 服务已启动: http://localhost:${PORT}`);
});
