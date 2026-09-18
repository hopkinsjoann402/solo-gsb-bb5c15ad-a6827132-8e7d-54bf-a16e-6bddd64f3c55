import { useState } from 'react';
import type { Evidence } from '../types';

interface Props {
  initial: Evidence | null;
  onSave: (data: { title: string; description: string; occurred_at: string | null }) => void;
  onClose: () => void;
}

export default function CardFormModal({ initial, onSave, onClose }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [occurredAt, setOccurredAt] = useState(initial?.occurred_at ?? '');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() === '') {
      setError('标题不能为空');
      return;
    }
    onSave({ title: title.trim(), description: description.trim(), occurred_at: occurredAt || null });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? '编辑证据' : '新建证据'}</h2>
        <form onSubmit={submit}>
          <label>
            标题 *
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：监控告警触发"
            />
          </label>
          <label>
            发生时间
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </label>
          <label>
            描述
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="证据来源、关键数据、影响范围…"
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn primary">
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
