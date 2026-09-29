import type { ReviewInput, ReviewOutcome } from '../solver/types';

/** 复核结果：成功时逐帧展示状态与转移证据；无法解释时指出最早死帧及该帧灯态。 */
export function ResultPanel({
  outcome,
  draft,
}: {
  outcome: ReviewOutcome;
  draft: ReviewInput;
}) {
  if (outcome.kind === 'unexplainable') {
    return (
      <section className="card result bad" aria-live="polite">
        <h2>无法解释</h2>
        <p>
          按帧顺序复核，第
          <strong className="dead-frame"> {outcome.firstDeadFrame + 1} </strong>
          帧（{outcome.firstDeadFrame === 0 ? '首帧' : `F${outcome.firstDeadFrame + 1}`}）
          起，在“零故障”及“任一路灯连续至少两帧卡滞”全部假设下均已无可达状态。
        </p>
        <p>
          该帧灯态：
          <code className="dead-lights">{outcome.frameLights}</code>
        </p>
        <p className="hint">
          请检查该帧及前一帧之间的观测与已登记的有向切换关系；单帧异常不满足“连续至少两帧卡为同一值”，不能作为故障解释。
        </p>
      </section>
    );
  }

  const m = draft.states[0].lights.length;
  const f = outcome.fault;

  return (
    <section className="card result ok" aria-live="polite">
      <h2>复核结果</h2>

      <div className={`verdict ${f ? 'fault' : 'clean'}`}>
        {f ? (
          <p>
            存在 1 条灯路卡滞故障：
            <strong>
              {' '}
              L{f.lamp + 1} 在第 {f.start + 1}～{f.end + 1} 帧连续卡为 {f.value}
            </strong>
            （故障窗 {f.end - f.start + 1} 帧，已按无故障优先、窗最短、灯路登记顺序、起帧、状态序列字典序择优）。
          </p>
        ) : (
          <p>
            <strong>无故障</strong>：全程观测与所选状态精确吻合，可保持原状态或沿登记边切换。
          </p>
        )}
        <p className="hint">共枚举 {outcome.considered} 个候选故障假设（含无故障）。</p>
      </div>

      <div className="table-scroll">
        <table className="evidence">
          <thead>
            <tr>
              <th>帧</th>
              <th>推断状态</th>
              <th>转移证据</th>
              {Array.from({ length: m }, (_, k) => (
                <th key={k} className={f && k === f.lamp ? 'fault-col' : ''}>
                  L{k + 1}
                  {f && k === f.lamp && <span className="col-tag">故障灯路</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outcome.evidence.map((e) => (
              <tr key={e.frame} className={e.transitionFromPrev === 'switch' ? 'switch-row' : ''}>
                <td className="frame-no">F{e.frame + 1}</td>
                <td className="state-name">{e.stateName}</td>
                <td className="transition">
                  {e.transitionFromPrev === 'start' && <span className="tag start">起始帧</span>}
                  {e.transitionFromPrev === 'stay' && (
                    <span className="tag stay">保持 ← {e.prevStateName}</span>
                  )}
                  {e.transitionFromPrev === 'switch' && (
                    <span className="tag switch">切换 {e.prevStateName} →</span>
                  )}
                </td>
                {e.lamps.map((l, k) => (
                  <td
                    key={k}
                    className={`evidence-lamp ${l.status === 'fault' ? 'fault' : l.observed === l.expected ? 'good' : ''}`}
                    title={
                      l.status === 'fault'
                        ? `故障窗内豁免：观测 ${l.observed}，常态应为 ${l.expected}`
                        : `观测 ${l.observed} / 常态 ${l.expected}`
                    }
                  >
                    <span className={`lamp small ${l.observed === '1' ? 'on' : 'off'}`}>{l.observed}</span>
                    <span className="expected">/{l.expected}</span>
                    {l.status === 'fault' && <span className="fault-mark" title="故障窗内">⚠</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
