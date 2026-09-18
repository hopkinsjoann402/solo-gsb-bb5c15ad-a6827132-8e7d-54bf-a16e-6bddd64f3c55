export interface Evidence {
  id: string;
  title: string;
  description: string;
  occurred_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Edge {
  id: string;
  from_id: string;
  to_id: string;
  created_at: string;
}

export interface BoardState {
  evidence: Evidence[];
  edges: Edge[];
  levels: Record<string, number>;
}

/** 连线被拒时的冲突信息：cycle 为完整闭环节点序列（首尾相同） */
export interface Conflict {
  cycle: string[];
  rejected: [string, string];
}
