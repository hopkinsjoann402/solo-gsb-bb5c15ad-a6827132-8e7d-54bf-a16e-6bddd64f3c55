import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'evidence-chain.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS evidence (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    occurred_at TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS edges (
    id         TEXT PRIMARY KEY,
    from_id    TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    to_id      TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
  CREATE INDEX IF NOT EXISTS idx_edges_to   ON edges(to_id);
`);

export interface EvidenceRow {
  id: string;
  title: string;
  description: string;
  occurred_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EdgeRow {
  id: string;
  from_id: string;
  to_id: string;
  created_at: string;
}

export function allEvidence(): EvidenceRow[] {
  return db
    .prepare('SELECT * FROM evidence ORDER BY created_at ASC, id ASC')
    .all() as EvidenceRow[];
}

export function allEdges(): EdgeRow[] {
  return db
    .prepare('SELECT * FROM edges ORDER BY created_at ASC, id ASC')
    .all() as EdgeRow[];
}

/* ---------------- 内置示例数据：一次支付服务宕机事故 ---------------- */

const SAMPLE_EVIDENCE: Array<{
  id: string;
  title: string;
  description: string;
  occurred_at: string;
}> = [
  {
    id: 'seed-deploy',
    title: '发布 payment-service v2.3.1',
    description: '08:55 由 CI 流水线完成灰度发布，变更了数据库连接池配置（max 由 50 改为 8）。',
    occurred_at: '2026-09-10T08:55',
  },
  {
    id: 'seed-error-log',
    title: '错误日志激增',
    description: '08:58 起 payment-service 的 ERROR 日志从每分钟 3 条升至 1200 条，均为连接超时。',
    occurred_at: '2026-09-10T08:58',
  },
  {
    id: 'seed-pool-exhausted',
    title: '数据库连接池耗尽',
    description: '09:00 连接池活跃连接达到上限 8，新请求开始排队并超时。',
    occurred_at: '2026-09-10T09:00',
  },
  {
    id: 'seed-alert',
    title: '监控告警触发',
    description: '09:02 告警平台报告支付成功率跌破 95% 阈值，电话值班通知发出。',
    occurred_at: '2026-09-10T09:02',
  },
  {
    id: 'seed-rollback',
    title: '执行版本回滚',
    description: '09:20 值班工程师将 payment-service 回滚至 v2.3.0，连接池配置恢复。',
    occurred_at: '2026-09-10T09:20',
  },
  {
    id: 'seed-recovered',
    title: '服务指标恢复',
    description: '09:25 支付成功率回升至 99.9%，错误日志恢复基线水平。',
    occurred_at: '2026-09-10T09:25',
  },
];

const SAMPLE_EDGES: Array<{ from: string; to: string }> = [
  { from: 'seed-deploy', to: 'seed-error-log' },
  { from: 'seed-error-log', to: 'seed-pool-exhausted' },
  { from: 'seed-pool-exhausted', to: 'seed-alert' },
  { from: 'seed-alert', to: 'seed-rollback' },
  { from: 'seed-rollback', to: 'seed-recovered' },
];

/** 用内置示例覆盖当前全部数据（事务内执行）。 */
export function loadSampleData(): void {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM evidence').run();
    const insertEvidence = db.prepare(
      `INSERT INTO evidence (id, title, description, occurred_at, created_at, updated_at)
       VALUES (@id, @title, @description, @occurred_at, @now, @now)`
    );
    for (const ev of SAMPLE_EVIDENCE) insertEvidence.run({ ...ev, now });
    const insertEdge = db.prepare(
      `INSERT INTO edges (id, from_id, to_id, created_at)
       VALUES (@id, @from, @to, @now)`
    );
    SAMPLE_EDGES.forEach((e, i) =>
      insertEdge.run({ id: `seed-edge-${i + 1}`, ...e, now })
    );
  });
  tx();
}

/** 首次启动且库为空时自动载入示例，便于直接体验。 */
export function seedIfEmpty(): void {
  const row = db.prepare('SELECT COUNT(*) AS n FROM evidence').get() as { n: number };
  if (row.n === 0) loadSampleData();
}
