import { useEffect } from 'react';

export interface ToastData {
  kind: 'success' | 'error' | 'info';
  text: string;
  key: number;
}

export default function Toast({ data, onDone }: { data: ToastData; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 5000);
    return () => window.clearTimeout(t);
  }, [data.key, onDone]);

  return (
    <div className={`toast toast-${data.kind}`} onClick={onDone}>
      {data.kind === 'error' ? '⚠ ' : data.kind === 'success' ? '✓ ' : 'ℹ '}
      {data.text}
    </div>
  );
}
