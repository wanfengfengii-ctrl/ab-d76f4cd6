import { useCallback, useEffect, useRef, useState } from 'react';
import { review, validateInput } from './solver/solver';
import type {
  Frame,
  ReviewInput,
  ReviewOutcome,
  StateDef,
  Transition,
} from './solver/types';
import { defaultDraft, uid, withDefaultEdges } from './defaults';
import { loadDraft, saveDraft } from './storage/draftDb';
import { ResultPanel } from './components/ResultPanel';

export default function App() {
  const [draft, setDraft] = useState<ReviewInput | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [report, setReport] = useState<ReviewOutcome | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);
  const saveTimer = useRef<number | null>(null);

  // 启动：从 IndexedDB 恢复草稿；首次访问写入带示例切换边的草稿。
  useEffect(() => {
    let alive = true;
    loadDraft()
      .then((stored) => {
        if (!alive) return;
        if (stored) {
          setDraft(stored);
        } else {
          setDraft(withDefaultEdges(defaultDraft()));
        }
      })
      .catch((e) => {
        if (alive) setLoadError(`草稿读取失败：${String(e)}`);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 任一编辑：去抖写入 IndexedDB，并立即撤销旧报告。
  const mutate = useCallback(
    (updater: (d: ReviewInput) => ReviewInput) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        setReport(null);
        setReviewError(null);
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          saveDraft(next)
            .then(() => {
              setSavedTick(true);
              window.setTimeout(() => setSavedTick(false), 1200);
            })
            .catch((e) => setLoadError(`草稿保存失败：${String(e)}`));
        }, 150);
        return next;
      });
    },
    [],
  );

  const lampCount = draft?.states[0]?.lights.length ?? 3;
  const validationError = draft ? validateInput(draft) : null;

  const runReview = useCallback(() => {
    if (!draft) return;
    try {
      setReport(review(draft));
      setReviewError(null);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : String(e));
      setReport(null);
    }
  }, [draft]);

  if (!draft) {
    return (
      <main className="page">
        <h1>变电站切换试验 · 指示灯序列复核</h1>
        {loadError ? <p className="error">{loadError}</p> : <p>正在载入草稿…</p>}
      </main>
    );
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>变电站切换试验 · 指示灯序列复核</h1>
        <div className="header-side">
          {savedTick && <span className="saved">草稿已保存</span>}
          <button className="primary" onClick={runReview} disabled={!!validationError}>
            复核
          </button>
        </div>
      </header>
      {(loadError || reviewError) && (
        <p className="error">{loadError ?? reviewError}</p>
      )}
      {validationError && <p className="warning">题面未就绪：{validationError}</p>}

      <div className="layout">
        <section className="card">
          <h2>运行状态与灯态（{draft.states.length} 个 / {lampCount} 路灯）</h2>
          <StatesEditor draft={draft} mutate={mutate} />
        </section>

        <section className="card">
          <h2>允许的有向状态切换</h2>
          <EdgesEditor draft={draft} mutate={mutate} />
        </section>

        <section className="card">
          <h2>观测帧（{draft.frames.length} 帧）</h2>
          <FramesEditor draft={draft} mutate={mutate} />
        </section>
      </div>

      {report && <ResultPanel outcome={report} draft={draft} />}
    </main>
  );
}

/* ---------------- 状态与灯态编辑 ---------------- */

function StatesEditor({
  draft,
  mutate,
}: {
  draft: ReviewInput;
  mutate: (u: (d: ReviewInput) => ReviewInput) => void;
}) {
  const m = draft.states[0].lights.length;

  const updateState = (id: string, patch: Partial<StateDef>) =>
    mutate((d) => ({
      ...d,
      states: d.states.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  const toggleLamp = (id: string, k: number) =>
    mutate((d) => ({
      ...d,
      states: d.states.map((s) => {
        if (s.id !== id) return s;
        const arr = s.lights.split('');
        arr[k] = arr[k] === '1' ? '0' : '1';
        return { ...s, lights: arr.join('') };
      }),
    }));

  const resizeLamps = (nextM: number) =>
    mutate((d) => {
      const clamp = Math.max(3, Math.min(8, nextM));
      return {
        ...d,
        states: d.states.map((s) => {
          if (s.lights.length === clamp) return s;
          if (s.lights.length < clamp)
            return { ...s, lights: s.lights + '0'.repeat(clamp - s.lights.length) };
          return { ...s, lights: s.lights.slice(0, clamp) };
        }),
        frames: d.frames.map((f) =>
          f.lights.length < clamp
            ? { lights: f.lights + '0'.repeat(clamp - f.lights.length) }
            : { lights: f.lights.slice(0, clamp) },
        ),
      };
    });

  const addState = () =>
    mutate((d) =>
      d.states.length >= 8
        ? d
        : {
            ...d,
            states: [...d.states, { id: uid('s'), name: `状态 ${d.states.length + 1}`, lights: '0'.repeat(m) }],
          },
    );

  const removeState = (id: string) =>
    mutate((d) => {
      if (d.states.length <= 4) return d;
      return {
        ...d,
        states: d.states.filter((s) => s.id !== id),
        transitions: d.transitions.filter((t) => t.from !== id && t.to !== id),
      };
    });

  return (
    <>
      <table className="grid">
        <thead>
          <tr>
            <th>状态</th>
            {Array.from({ length: m }, (_, k) => (
              <th key={k} title={`第 ${k + 1} 路灯（登记顺序）`}>L{k + 1}</th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {draft.states.map((s) => (
            <tr key={s.id}>
              <td>
                <input
                  value={s.name}
                  onChange={(e) => updateState(s.id, { name: e.target.value })}
                  aria-label="状态名称"
                />
              </td>
              {Array.from({ length: m }, (_, k) => (
                <td key={k} className="lamp-cell">
                  <button
                    type="button"
                    className={`lamp ${s.lights[k] === '1' ? 'on' : 'off'}`}
                    onClick={() => toggleLamp(s.id, k)}
                    aria-label={`状态 ${s.name} 第 ${k + 1} 路灯`}
                  >
                    {s.lights[k]}
                  </button>
                </td>
              ))}
              <td>
                <button type="button" className="ghost danger" onClick={() => removeState(s.id)} disabled={draft.states.length <= 4}>
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row-actions">
        <button type="button" className="ghost" onClick={addState} disabled={draft.states.length >= 8}>
          ＋ 添加状态
        </button>
        <div className="lamp-count">
          灯路数：
          <button type="button" className="ghost" onClick={() => resizeLamps(m - 1)} disabled={m <= 3}>－</button>
          <span className="badge">{m}</span>
          <button type="button" className="ghost" onClick={() => resizeLamps(m + 1)} disabled={m >= 8}>＋</button>
        </div>
      </div>
    </>
  );
}

/* ---------------- 有向切换边编辑 ---------------- */

function EdgesEditor({
  draft,
  mutate,
}: {
  draft: ReviewInput;
  mutate: (u: (d: ReviewInput) => ReviewInput) => void;
}) {
  const options = draft.states;

  const updateEdge = (idx: number, patch: Partial<Transition>) =>
    mutate((d) => ({
      ...d,
      transitions: d.transitions.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));

  const addEdge = () =>
    mutate((d) => ({
      ...d,
      transitions: [...d.transitions, { from: d.states[0]?.id ?? '', to: d.states[0]?.id ?? '' }],
    }));

  const removeEdge = (idx: number) =>
    mutate((d) => ({ ...d, transitions: d.transitions.filter((_, i) => i !== idx) }));

  const invalid = (t: Transition) =>
    !t.from || !t.to || t.from === t.to;

  return (
    <>
      <ul className="edges">
        {draft.transitions.map((t, i) => (
          <li key={i} className={invalid(t) ? 'invalid' : ''}>
            <select value={t.from} onChange={(e) => updateEdge(i, { from: e.target.value })}>
              {options.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <span className="arrow">→</span>
            <select value={t.to} onChange={(e) => updateEdge(i, { to: e.target.value })}>
              {options.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button type="button" className="ghost danger" onClick={() => removeEdge(i)}>删除</button>
          </li>
        ))}
      </ul>
      <button type="button" className="ghost" onClick={addEdge}>＋ 添加切换关系</button>
      <p className="hint">说明：每个状态默认允许保持原状态；登记的边表示允许沿其方向切换一次。自身到自身的关系不参与计算。</p>
    </>
  );
}

/* ---------------- 观测帧编辑 ---------------- */

function FramesEditor({
  draft,
  mutate,
}: {
  draft: ReviewInput;
  mutate: (u: (d: ReviewInput) => ReviewInput) => void;
}) {
  const m = draft.states[0].lights.length;

  const setFrame = (idx: number, lights: string) =>
    mutate((d) => ({
      ...d,
      frames: d.frames.map((f, i) => (i === idx ? { lights } : f)),
    }));

  const toggleFrameLamp = (idx: number, k: number) =>
    mutate((d) => ({
      ...d,
      frames: d.frames.map((f, i) => {
        if (i !== idx) return f;
        const norm = f.lights.padEnd(m, '0').slice(0, m);
        const arr = norm.split('');
        arr[k] = arr[k] === '1' ? '0' : '1';
        return { lights: arr.join('') } as Frame;
      }),
    }));

  const addFrame = () =>
    mutate((d) =>
      d.frames.length >= 20
        ? d
        : { ...d, frames: [...d.frames, { lights: '0'.repeat(m) }] },
    );

  const removeFrame = (idx: number) =>
    mutate((d) =>
      d.frames.length <= 6
        ? d
        : { ...d, frames: d.frames.filter((_, i) => i !== idx) },
    );

  return (
    <>
      <table className="grid frames-grid">
        <thead>
          <tr>
            <th>帧</th>
            {Array.from({ length: m }, (_, k) => (
              <th key={k}>L{k + 1}</th>
            ))}
            <th>原始串</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {draft.frames.map((f, idx) => {
            const lights = f.lights.padEnd(m, '0').slice(0, m);
            return (
            <tr key={idx}>
              <td className="frame-no">F{idx + 1}</td>
              {Array.from({ length: m }, (_, k) => (
                <td key={k} className="lamp-cell">
                  <button
                    type="button"
                    className={`lamp ${lights[k] === '1' ? 'on' : 'off'}`}
                    onClick={() => toggleFrameLamp(idx, k)}
                  >
                    {lights[k]}
                  </button>
                </td>
              ))}
              <td>
                <input
                  className="raw-input"
                  value={f.lights}
                  maxLength={m}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^01]/g, '').slice(0, m);
                    setFrame(idx, v);
                  }}
                />
              </td>
              <td>
                <button type="button" className="ghost danger" onClick={() => removeFrame(idx)} disabled={draft.frames.length <= 6}>
                  删除
                </button>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="ghost" onClick={addFrame} disabled={draft.frames.length >= 20}>
        ＋ 添加观测帧
      </button>
    </>
  );
}
