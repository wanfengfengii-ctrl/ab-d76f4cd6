import type { Scenario } from '../solver/types';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

/** 0/1 录入下拉；空串表示未录入 */
export function BitSelect({ value, onChange }: Props) {
  return (
    <select
      className="bit-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">-</option>
      <option value="0">0</option>
      <option value="1">1</option>
    </select>
  );
}

export function LampEditor({
  scenario,
  onPatch,
}: {
  scenario: Scenario;
  onPatch: (next: Scenario) => void;
}) {
  const lamps = scenario.lampOrder;

  const rename = (i: number, name: string) => {
    const lampOrder = lamps.map((x, j) => (j === i ? name : x));
    onPatch({ ...scenario, lampOrder });
  };

  const add = () => {
    if (lamps.length >= 8) return;
    onPatch({
      ...scenario,
      lampOrder: [...lamps, `L${lamps.length + 1}`],
      states: scenario.states.map((s) => ({ ...s, lamps: [...s.lamps, '0'] })),
      frames: scenario.frames.map((f) => ({
        observed: [...f.observed, '0'],
      })),
    });
  };

  const remove = (i: number) => {
    if (lamps.length <= 3) return;
    onPatch({
      ...scenario,
      lampOrder: lamps.filter((_, j) => j !== i),
      states: scenario.states.map((s) => ({
        ...s,
        lamps: s.lamps.filter((_, j) => j !== i),
      })),
      frames: scenario.frames.map((f) => ({
        observed: f.observed.filter((_, j) => j !== i),
      })),
    });
  };

  return (
    <div>
      <div className="row">
        {lamps.map((name, i) => (
          <span className="edge-row" key={i}>
            <input
              type="text"
              value={name}
              onChange={(e) => rename(i, e.target.value)}
              aria-label={`第 ${i + 1} 路灯路名称`}
            />
            <button
              className="danger"
              onClick={() => remove(i)}
              disabled={lamps.length <= 3}
              title="删除该灯路"
            >
              删除
            </button>
          </span>
        ))}
        <button onClick={add} disabled={lamps.length >= 8}>
          新增灯路
        </button>
        <span className="count-badge">{lamps.length}/8 路（限 3~8）</span>
      </div>
    </div>
  );
}

export function StateEditor({
  scenario,
  onPatch,
}: {
  scenario: Scenario;
  onPatch: (next: Scenario) => void;
}) {
  const { states, lampOrder } = scenario;

  const rename = (i: number, name: string) => {
    const oldName = states[i].name;
    onPatch({
      ...scenario,
      states: states.map((s, j) => (j === i ? { ...s, name } : s)),
      edges: scenario.edges.map((e) => ({
        from: e.from === oldName ? name : e.from,
        to: e.to === oldName ? name : e.to,
      })),
    });
  };

  const setBit = (i: number, k: number, v: string) => {
    onPatch({
      ...scenario,
      states: states.map((s, j) =>
        j === i
          ? { ...s, lamps: s.lamps.map((b, kk) => (kk === k ? v : b)) }
          : s,
      ),
    });
  };

  const add = () => {
    if (states.length >= 8) return;
    onPatch({
      ...scenario,
      states: [
        ...states,
        { name: `S${states.length + 1}`, lamps: lampOrder.map(() => '0') },
      ],
    });
  };

  const remove = (i: number) => {
    if (states.length <= 4) return;
    const removed = states[i];
    onPatch({
      ...scenario,
      states: states.filter((_, j) => j !== i),
      edges: scenario.edges.filter(
        (e) => e.from !== removed.name && e.to !== removed.name,
      ),
    });
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th className="name-cell">运行状态</th>
            {lampOrder.map((name, k) => (
              <th key={k}>{name || `灯路${k + 1}`}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {states.map((s, i) => (
            <tr key={i}>
              <td className="name-cell">
                <input
                  type="text"
                  value={s.name}
                  onChange={(e) => rename(i, e.target.value)}
                  aria-label={`第 ${i + 1} 个状态名称`}
                />
              </td>
              {lampOrder.map((_, k) => (
                <td key={k}>
                  <BitSelect
                    value={s.lamps[k] ?? ''}
                    onChange={(v) => setBit(i, k, v)}
                  />
                </td>
              ))}
              <td>
                <button
                  className="danger"
                  onClick={() => remove(i)}
                  disabled={states.length <= 4}
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={add} disabled={states.length >= 8}>
          新增状态
        </button>
        <span className="count-badge">{states.length}/8 个（限 4~8）</span>
      </div>
    </div>
  );
}

export function EdgeEditor({
  scenario,
  onPatch,
}: {
  scenario: Scenario;
  onPatch: (next: Scenario) => void;
}) {
  const names = scenario.states.map((s) => s.name);

  const setEdge = (i: number, part: 'from' | 'to', v: string) => {
    onPatch({
      ...scenario,
      edges: scenario.edges.map((e, j) =>
        j === i ? { ...e, [part]: v } : e,
      ),
    });
  };

  const add = () => {
    const first = names[0] ?? '';
    onPatch({
      ...scenario,
      edges: [...scenario.edges, { from: first, to: first }],
    });
  };

  const remove = (i: number) => {
    onPatch({
      ...scenario,
      edges: scenario.edges.filter((_, j) => j !== i),
    });
  };

  return (
    <div>
      <p className="panel-hint">
        登记允许的有向切换边；任意状态始终允许保持原状态（自环），无需登记。
      </p>
      {scenario.edges.length === 0 && (
        <p className="panel-hint">尚未登记切换边（全程只能保持原状态）。</p>
      )}
      {scenario.edges.map((e, i) => (
        <span className="edge-row" key={i}>
          <select value={e.from} onChange={(ev) => setEdge(i, 'from', ev.target.value)}>
            {names.map((n) => (
              <option key={n} value={n}>
                {n || '(未命名)'}
              </option>
            ))}
          </select>
          <span className="arrow">→</span>
          <select value={e.to} onChange={(ev) => setEdge(i, 'to', ev.target.value)}>
            {names.map((n) => (
              <option key={n} value={n}>
                {n || '(未命名)'}
              </option>
            ))}
          </select>
          <button className="danger" onClick={() => remove(i)}>
            删除
          </button>
        </span>
      ))}
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={add}>新增切换边</button>
      </div>
    </div>
  );
}

export function FrameEditor({
  scenario,
  onPatch,
}: {
  scenario: Scenario;
  onPatch: (next: Scenario) => void;
}) {
  const { frames, lampOrder } = scenario;

  const setBit = (t: number, k: number, v: string) => {
    onPatch({
      ...scenario,
      frames: frames.map((f, tt) =>
        tt === t
          ? { observed: f.observed.map((b, kk) => (kk === k ? v : b)) }
          : f,
      ),
    });
  };

  const add = () => {
    if (frames.length >= 20) return;
    onPatch({
      ...scenario,
      frames: [...frames, { observed: lampOrder.map(() => '0') }],
    });
  };

  const remove = (t: number) => {
    if (frames.length <= 6) return;
    onPatch({
      ...scenario,
      frames: frames.filter((_, tt) => tt !== t),
    });
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>帧序</th>
            {lampOrder.map((name, k) => (
              <th key={k}>{name || `灯路${k + 1}`}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {frames.map((f, t) => (
            <tr key={t}>
              <td>第 {t + 1} 帧</td>
              {lampOrder.map((_, k) => (
                <td key={k}>
                  <BitSelect
                    value={f.observed[k] ?? ''}
                    onChange={(v) => setBit(t, k, v)}
                  />
                </td>
              ))}
              <td>
                <button
                  className="danger"
                  onClick={() => remove(t)}
                  disabled={frames.length <= 6}
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={add} disabled={frames.length >= 20}>
          追加观测帧
        </button>
        <span className="count-badge">{frames.length}/20 帧（限 6~20）</span>
      </div>
    </div>
  );
}
