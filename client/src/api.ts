import type { BoardState } from './types';

export class ApiError extends Error {
  status: number;
  cycle?: string[];
  constructor(status: number, message: string, cycle?: string[]) {
    super(message);
    this.status = status;
    this.cycle = cycle;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.message || `请求失败（${res.status}）`, body.cycle);
  }
  return body as T;
}

export const api = {
  state: () => request<BoardState>('/api/state'),

  createEvidence: (data: { title: string; description: string; occurred_at: string | null }) =>
    request<BoardState>('/api/evidence', { method: 'POST', body: JSON.stringify(data) }),

  updateEvidence: (
    id: string,
    data: { title: string; description: string; occurred_at: string | null }
  ) => request<BoardState>(`/api/evidence/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteEvidence: (id: string) =>
    request<BoardState>(`/api/evidence/${id}`, { method: 'DELETE' }),

  createEdge: (from: string, to: string) =>
    request<BoardState>('/api/edges', { method: 'POST', body: JSON.stringify({ from, to }) }),

  deleteEdge: (id: string) => request<BoardState>(`/api/edges/${id}`, { method: 'DELETE' }),

  importSnapshot: (snapshot: unknown) =>
    request<BoardState>('/api/import', { method: 'POST', body: JSON.stringify(snapshot) }),

  loadSample: () => request<BoardState>('/api/seed', { method: 'POST' }),
};
