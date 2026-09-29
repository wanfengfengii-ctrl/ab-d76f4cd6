import { useEffect, useMemo, useRef, useState } from 'react';
import { loadDraft, saveDraft } from './db';
import { explain } from './solver/solver';
import { validateScenario } from './solver/validation';
import type { ExplainResult, Scenario } from './solver/types';
import { createDefaultScenario } from './solver/defaults';
import {
  EdgeEditor,
  FrameEditor,
  LampEditor,
  StateEditor,
} from './components/Editors';
import { Report } from './components/Report';

export function App() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [savedTick, setSavedTick] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    void loadDraft().then((s) => {
      if (alive) setScenario(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 任一编辑：立即撤销旧报告，并把草稿写入 IndexedDB（写入做极短防抖以合并连打）
  const patch = (next: Scenario) => {
    setScenario(next);
    setResult(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveDraft(next).then(() => setSavedTick((t) => t + 1));
    }, 150);
  };

  const errors = useMemo(
    () => (scenario ? validateScenario(scenario) : []),
    [scenario],
  );

  if (!scenario) {
    return (
      <div className="app">
        <p>正在从本机 IndexedDB 载入草稿…</p>
      </div>
    );
  }

  const review = () => {
    if (errors.length > 0) return;
    setResult(explain(scenario));
  };

  const resetExample = () => {
    if (!window.confirm('确定恢复为内置示例？当前草稿将被覆盖。')) return;
    patch(createDefaultScenario());
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>变电站指示灯序列切换复核</h1>
          <div className="sub">
            联合选择全程状态（保持或沿登记边切换），允许零故障或一条灯路连续
            ≥2 帧卡为同一观测值。
          </div>
        </div>
        <div className="save-hint" key={savedTick}>
          草稿自动保存于本机 IndexedDB{savedTick > 0 ? '（已保存）' : ''}
        </div>
      </header>

      <section className="panel">
        <h2>灯路登记（顺序即为故障裁决优先级）</h2>
        <LampEditor scenario={scenario} onPatch={patch} />
      </section>

      <section className="panel">
        <h2>运行状态与灯态</h2>
        <StateEditor scenario={scenario} onPatch={patch} />
      </section>

      <section className="panel">
        <h2>允许的有向状态切换</h2>
        <EdgeEditor scenario={scenario} onPatch={patch} />
      </section>

      <section className="panel">
        <h2>采样观测帧</h2>
        <FrameEditor scenario={scenario} onPatch={patch} />
      </section>

      <div className="actions">
        <button className="primary" onClick={review} disabled={errors.length > 0}>
          复核
        </button>
        <button onClick={resetExample}>恢复示例</button>
        {errors.length > 0 && (
          <ul className="error-list">
            {errors.slice(0, 6).map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
            {errors.length > 6 && <li>…另有 {errors.length - 6} 项问题</li>}
          </ul>
        )}
        {result && <span className="stale-note">报告基于点击复核时的数据，再次编辑即撤销。</span>}
      </div>

      {result && (
        <section className="panel">
          <h2>逐帧状态与转移证据</h2>
          <Report result={result} lampNames={scenario.lampOrder} />
        </section>
      )}

      <footer className="rule-note">
        裁决优先级：① 无故障解优先；② 单灯路卡滞时取故障窗最短；③
        灯路按登记顺序靠前者优先；④ 起帧更早优先；⑤
        状态序列按状态名字典序最小。卡滞窗内该路灯读数忽略，但窗内读数须恒为同一固定值；
        故障窗外及其他灯路必须与所在状态精确吻合。
      </footer>
    </div>
  );
}
