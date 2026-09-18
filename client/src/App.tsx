import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { BoardState, Conflict, Evidence } from './types';
import Board from './components/Board';
import CardFormModal from './components/CardFormModal';
import Toast, { ToastData } from './components/Toast';

export default function App() {
  const [state, setState] = useState<BoardState | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; evidence: Evidence } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conflictTimer = useRef<number | null>(null);

  const showToast = useCallback((kind: ToastData['kind'], text: string) => {
    setToast({ kind, text, key: Date.now() });
  }, []);

  const showConflict = useCallback((c: Conflict, message: string) => {
    setConflict(c);
    showToast('error', message);
    if (conflictTimer.current) window.clearTimeout(conflictTimer.current);
    conflictTimer.current = window.setTimeout(() => setConflict(null), 9000);
  }, [showToast]);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '加载失败');
    }
  }, [showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /* ---------- 卡片 ---------- */

  const handleSaveCard = async (data: { title: string; description: string; occurred_at: string | null }) => {
    try {
      if (modal?.mode === 'edit') {
        setState(await api.updateEvidence(modal.evidence.id, data));
        showToast('success', '证据已更新');
      } else {
        setState(await api.createEvidence(data));
        showToast('success', '证据已创建');
      }
      setModal(null);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '保存失败');
    }
  };

  const handleDeleteCard = async (ev: Evidence) => {
    if (!window.confirm(`删除证据「${ev.title}」？其关联的先后关系将一并删除。`)) return;
    try {
      setState(await api.deleteEvidence(ev.id));
      setConflict(null);
      showToast('success', '证据已删除');
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '删除失败');
    }
  };

  /* ---------- 连线 ---------- */

  const handleCompleteConnect = async (targetId: string) => {
    const from = connectingFrom;
    setConnectingFrom(null);
    if (!from) return;
    if (from === targetId) {
      showToast('info', '已取消：证据不能关联到自身');
      return;
    }
    try {
      setState(await api.createEdge(from, targetId));
      setConflict(null);
      showToast('success', '先后关系已建立，时间线已按拓扑层级重排');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.cycle) {
        showConflict({ cycle: e.cycle, rejected: [from, targetId] }, e.message);
      } else {
        showToast('error', e instanceof Error ? e.message : '连线失败');
      }
    }
  };

  const handleDeleteEdge = async (edgeId: string) => {
    try {
      setState(await api.deleteEdge(edgeId));
      setSelectedEdgeId(null);
      showToast('success', '关系已删除，时间线已重排');
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '删除失败');
    }
  };

  /* ---------- 导入 / 导出 / 示例 ---------- */

  const handleExport = async () => {
    try {
      const res = await fetch('/api/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evidence-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('success', '快照已导出');
    } catch {
      showToast('error', '导出失败');
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const snapshot = JSON.parse(text);
      if (!window.confirm('导入将覆盖当前全部证据与关系，确定继续？')) return;
      setState(await api.importSnapshot(snapshot));
      setConflict(null);
      showToast('success', '快照导入成功');
    } catch (e) {
      if (e instanceof SyntaxError) {
        showToast('error', '导入失败：文件不是合法 JSON');
      } else if (e instanceof ApiError && e.status === 409 && e.cycle) {
        showConflict({ cycle: e.cycle, rejected: [e.cycle[0], e.cycle[1]] }, e.message);
      } else {
        showToast('error', e instanceof Error ? e.message : '导入失败');
      }
    }
  };

  const handleLoadSample = async () => {
    if (!window.confirm('载入示例数据将覆盖当前全部内容，确定继续？')) return;
    try {
      setState(await api.loadSample());
      setConflict(null);
      showToast('success', '已载入示例事故数据');
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : '操作失败');
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">⛓</span>
          <div>
            <h1>事故证据链编排器</h1>
            <p className="brand-sub">用「必须早于」关系编排证据，自动生成可解释时间线</p>
          </div>
        </div>
        <div className="toolbar">
          <button className="btn primary" onClick={() => setModal({ mode: 'create' })}>
            ＋ 新建证据
          </button>
          <button className="btn" onClick={handleExport} disabled={!state}>
            ⬇ 导出快照
          </button>
          <button className="btn" onClick={() => fileInputRef.current?.click()}>
            ⬆ 导入快照
          </button>
          <button className="btn" onClick={handleLoadSample}>
            ✦ 载入示例
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <div className="legend">
        <span className="legend-item"><i className="legend-arrow" /> 连线表示「必须早于」</span>
        <span className="legend-item"><i className="legend-col" /> 列即拓扑层级，越靠右发生越晚</span>
        <span className="legend-item"><i className="legend-conflict" /> 红色高亮为被拒绝的时间环</span>
        <span className="legend-hint">操作：点击卡片右侧「⇢」开始连线，再点击目标卡片完成；点击连线可删除。</span>
      </div>

      {state ? (
        <Board
          state={state}
          conflict={conflict}
          connectingFrom={connectingFrom}
          selectedEdgeId={selectedEdgeId}
          onStartConnect={(id) => {
            setConnectingFrom(id);
            setSelectedEdgeId(null);
          }}
          onCancelConnect={() => setConnectingFrom(null)}
          onCompleteConnect={handleCompleteConnect}
          onEditCard={(ev) => setModal({ mode: 'edit', evidence: ev })}
          onDeleteCard={handleDeleteCard}
          onSelectEdge={setSelectedEdgeId}
          onDeleteEdge={handleDeleteEdge}
        />
      ) : (
        <div className="loading">加载中…</div>
      )}

      {modal && (
        <CardFormModal
          initial={modal.mode === 'edit' ? modal.evidence : null}
          onSave={handleSaveCard}
          onClose={() => setModal(null)}
        />
      )}
      {toast && <Toast data={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
