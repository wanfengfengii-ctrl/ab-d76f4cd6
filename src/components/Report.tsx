import type { ExplainResult } from '../solver/types';

export function Report({
  result,
  lampNames,
}: {
  result: ExplainResult;
  lampNames: string[];
}) {
  if (result.status === 'unexplainable') {
    const u = result.unexplainable!;
    return (
      <div>
        <div className="banner unexplainable">
          <strong>无法解释该观测序列</strong>
          <div className="detail-line">
            按帧顺序最早已无可达状态的观测位置：
            <strong>第 {u.frameIndex + 1} 帧</strong>
            （从第 1 帧起计；允许保持原状态、沿登记边切换，以及零故障或单灯路连续 ≥2 帧卡滞）。
          </div>
          <div className="detail-line">
            该帧灯态：
            {u.observed.map((b, k) => (
              <span
                key={k}
                className="lamp-mismatch"
                style={{ marginLeft: 8 }}
              >
                {lampNames[k] || `灯${k + 1}`}={b === null ? '未录入' : b}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const f = result.fault;
  return (
    <div>
      {result.status === 'normal' && (
        <div className="banner normal">
          <strong>复核通过：零故障</strong>
          <div className="detail-line">
            全程 {result.path.length} 帧均可在保持原状态或沿登记边切换下精确吻合，无需引入卡滞故障。
          </div>
        </div>
      )}
      {result.status === 'fault' && f && (
        <div className="banner fault">
          <strong>发现单灯路卡滞故障</strong>
          <div className="detail-line">
            灯路 <strong>{f.lampName}</strong>（第 {f.lampIndex + 1} 路）自
            <strong> 第 {f.startFrame + 1} 帧 </strong>
            起连续 <strong>{f.windowLength}</strong> 帧（至第 {f.endFrame + 1}{' '}
            帧）卡在固定值 <strong>{f.stuckValue}</strong>。
          </div>
          <div className="detail-line">
            故障窗外帧与其他灯路均精确吻合；已按「无故障优先 →
            最短故障窗 → 灯路登记顺序 → 起帧 → 状态序列字典序」裁决。
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>帧</th>
              <th>状态</th>
              <th>转移证据</th>
              {result.evidence[0]?.lamps.map((l) => (
                <th key={l.lampIndex}>{l.lampName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.evidence.map((ev) => {
              const prev =
                ev.frameIndex > 0
                  ? result.path[ev.frameIndex - 1]
                  : null;
              return (
                <tr
                  key={ev.frameIndex}
                  className={ev.inFaultWindow ? 'in-window' : undefined}
                >
                  <td>{ev.frameIndex + 1}</td>
                  <td>
                    <strong>{ev.stateName}</strong>
                    {ev.inFaultWindow && (
                      <span className="cell-sub">故障窗内</span>
                    )}
                  </td>
                  <td>
                    {ev.transition === null && (
                      <span className="trans-self">起始帧</span>
                    )}
                    {ev.transition === 'self' && (
                      <span className="trans-self">保持 {prev}</span>
                    )}
                    {ev.transition === 'edge' && (
                      <span className="trans-edge">
                        {prev} → {ev.stateName}
                      </span>
                    )}
                  </td>
                  {ev.lamps.map((l) => (
                    <td key={l.lampIndex}>
                      <span>
                        观/期 {l.observed}/{l.expected}
                      </span>
                      {l.ignored ? (
                        <span className="cell-sub lamp-ignored">
                          卡滞忽略
                        </span>
                      ) : l.match ? (
                        <span className="cell-sub lamp-match">吻合</span>
                      ) : (
                        <span className="cell-sub lamp-mismatch">不符</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
