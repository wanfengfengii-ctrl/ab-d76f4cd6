import type {
  FaultWindow,
  Frame,
  FrameEvidence,
  ReviewInput,
  ReviewOutcome,
  StateDef,
} from './types';

/** 题面校验：不满足录入约束时返回错误说明。 */
export function validateInput(input: ReviewInput): string | null {
  const { states, transitions, frames } = input;
  if (states.length < 4 || states.length > 8) return '运行状态数量需在 4 至 8 个之间';
  if (frames.length < 6 || frames.length > 20) return '观测帧数需在 6 至 20 帧之间';

  const m = states[0].lights.length;
  if (m < 3 || m > 8) return '灯路数量需在 3 至 8 路之间';

  const ids = new Set<string>();
  for (const s of states) {
    if (!s.name.trim()) return '存在未命名的运行状态';
    if (ids.has(s.id)) return `状态标识重复：${s.id}`;
    ids.add(s.id);
    if (s.lights.length !== m || !/^[01]+$/.test(s.lights))
      return `状态「${s.name}」灯态必须为 ${m} 位 0/1`;
  }

  for (const t of transitions) {
    if (!ids.has(t.from) || !ids.has(t.to))
      return `存在引用未知状态的切换关系：${t.from} → ${t.to}`;
  }

  for (let i = 0; i < frames.length; i++) {
    if (frames[i].lights.length !== m || !/^[01]+$/.test(frames[i].lights))
      return `第 ${i + 1} 帧灯态必须为 ${m} 位 0/1`;
  }
  return null;
}

interface Compiled {
  n: number;
  m: number;
  /** allowed[i] 含 i（允许保持原状态）以及全部登记边 i→j。 */
  allowed: number[][];
  /** expect[s][k] 为状态 s 第 k 路灯常态值。 */
  expect: Uint8Array[];
  obs: Uint8Array[];
  states: StateDef[];
}

function compile(input: ReviewInput): Compiled {
  const { states, transitions, frames } = input;
  const n = states.length;
  const m = states[0].lights.length;
  const index = new Map<string, number>();
  states.forEach((s, i) => index.set(s.id, i));

  const allowed: number[][] = states.map((_, i) => [i]);
  for (const t of transitions) {
    const a = index.get(t.from)!;
    const b = index.get(t.to)!;
    if (a !== b && !allowed[a].includes(b)) allowed[a].push(b);
  }

  const expect = states.map(
    (s) => Uint8Array.from(s.lights, (ch) => (ch === '1' ? 1 : 0)),
  );
  const obs: Uint8Array[] = frames.map((f: Frame) =>
    Uint8Array.from(f.lights, (ch) => (ch === '1' ? 1 : 0)),
  );

  return { n, m, allowed, expect, obs, states };
}

/** 帧 t 在故障窗 fault 下，状态 s 是否与观测相容（其他灯路必须精确吻合）。 */
function compatible(
  c: Compiled,
  t: number,
  s: number,
  fault: FaultWindow | null,
): boolean {
  const e = c.expect[s];
  const o = c.obs[t];
  for (let k = 0; k < c.m; k++) {
    if (fault && t >= fault.start && t <= fault.end && k === fault.lamp) continue;
    if (e[k] !== o[k]) return false;
  }
  return true;
}

/** 某一故障窗在观测上是否成立：窗内该灯路观测值全程相同，且恰为 value。 */
function windowHolds(c: Compiled, f: FaultWindow): boolean {
  const v = c.obs[f.start][f.lamp];
  if (f.value !== (v === 1 ? '1' : '0')) return false;
  for (let t = f.start; t <= f.end; t++) {
    if (c.obs[t][f.lamp] !== v) return false;
  }
  return true;
}

interface Solution {
  fault: FaultWindow | null;
  seq: number[];
}

/**
 * 在固定故障假设下，用前向可达 + 反向可行做存在性与可行路径枚举。
 * 返回 null 表示该假设无法解释观测。
 */
function solveUnder(c: Compiled, fault: FaultWindow | null): number[] | null {
  const T = c.obs.length;
  // forward[t]：第 t 帧可达状态集。
  const reach: Uint8Array[] = [];
  reach.push(new Uint8Array(c.n));
  for (let s = 0; s < c.n; s++) {
    if (compatible(c, 0, s, fault)) reach[0][s] = 1;
  }
  for (let t = 1; t < T; t++) {
    const cur = new Uint8Array(c.n);
    const prev = reach[t - 1];
    for (let p = 0; p < c.n; p++) {
      if (!prev[p]) continue;
      for (const s of c.allowed[p]) {
        if (compatible(c, t, s, fault)) cur[s] = 1;
      }
    }
    reach.push(cur);
  }

  // reverse[t][s]：从 (t, s) 出发能否走到最后一帧。
  const canFinish: Uint8Array[] = new Array(T);
  canFinish[T - 1] = reach[T - 1];
  for (let t = T - 2; t >= 0; t--) {
    const cur = new Uint8Array(c.n);
    const next = canFinish[t + 1];
    for (let s = 0; s < c.n; s++) {
      if (!reach[t][s]) continue;
      for (const q of c.allowed[s]) {
        if (next[q]) {
          cur[s] = 1;
          break;
        }
      }
    }
    canFinish[t] = cur;
  }

  if (!Array.from(canFinish[0]).some(Boolean)) return null;

  // 贪心：从帧 0 起每帧取编号最小的可继续状态，得到状态序列字典序最小解。
  const seq: number[] = [];
  let prev = -1;
  for (let t = 0; t < T; t++) {
    const candidates =
      prev < 0
        ? Array.from({ length: c.n }, (_, s) => s)
        : c.allowed[prev];
    // candidates 可能未排序（登记边追加在保持之后），需按编号找最小。
    let best = -1;
    for (const s of candidates) {
      if (canFinish[t][s] && (best === -1 || s < best)) best = s;
    }
    if (best === -1) return null;
    seq.push(best);
    prev = best;
  }
  return seq;
}

/** 枚举全部单灯路卡滞候选窗：每路灯观测值的每个连续同值游程中长度≥2 的连续子区间。 */
function enumerateFaults(c: Compiled): FaultWindow[] {
  const faults: FaultWindow[] = [];
  for (let k = 0; k < c.m; k++) {
    let runStart = 0;
    for (let t = 1; t <= c.obs.length; t++) {
      if (t < c.obs.length && c.obs[t][k] === c.obs[runStart][k]) continue;
      // 游程 [runStart, t-1]
      const len = t - runStart;
      if (len >= 2) {
        const value = c.obs[runStart][k] === 1 ? '1' : '0';
        for (let a = runStart; a < t; a++) {
          for (let b = a + 1; b < t; b++) {
            faults.push({ lamp: k, start: a, end: b, value });
          }
        }
      }
      runStart = t;
    }
  }
  return faults;
}

/**
 * 联合选择全程状态并复核观测。
 *
 * 允许保持原状态或沿登记的有向边切换；仅允许零次故障，或一条灯路在连续至少
 * 两帧内卡为同一观测值；故障窗外及其他灯路必须精确吻合。
 *
 * 择优顺序：无故障优先 → 故障窗最短 → 灯路登记顺序 → 起帧最早 →
 * 状态序列字典序。
 */
export function review(input: ReviewInput): ReviewOutcome {
  const err = validateInput(input);
  if (err) throw new Error(err);
  const c = compile(input);
  const T = c.obs.length;

  const faultFree = solveUnder(c, null);

  // 无法解释定位：取全部假设下逐帧可达集的并集，找最早空帧。
  if (faultFree === null) {
    const unionReach: Uint8Array[] = c.obs.map(() => new Uint8Array(c.n));
    const accumulate = (fault: FaultWindow | null) => {
      const r0 = new Uint8Array(c.n);
      for (let s = 0; s < c.n; s++) if (compatible(c, 0, s, fault)) r0[s] = 1;
      for (let s = 0; s < c.n; s++) unionReach[0][s] ||= r0[s];
      let prev = r0;
      for (let t = 1; t < T; t++) {
        const cur = new Uint8Array(c.n);
        for (let p = 0; p < c.n; p++) {
          if (!prev[p]) continue;
          for (const s of c.allowed[p]) {
            if (compatible(c, t, s, fault)) cur[s] = 1;
          }
        }
        for (let s = 0; s < c.n; s++) unionReach[t][s] ||= cur[s];
        prev = cur;
      }
    };

    accumulate(null);
    for (const f of enumerateFaults(c)) {
      if (windowHolds(c, f)) accumulate(f);
    }

    let firstDead = -1;
    for (let t = 0; t < T; t++) {
      if (!Array.from(unionReach[t]).some(Boolean)) {
        firstDead = t;
        break;
      }
    }
    if (firstDead >= 0) {
      return {
        kind: 'unexplainable',
        firstDeadFrame: firstDead,
        frameLights: input.frames[firstDead].lights,
      };
    }
  }

  const solutions: Solution[] = [];
  let considered = 0;
  if (faultFree !== null) {
    solutions.push({ fault: null, seq: faultFree });
    considered++;
  } else {
    const faults = enumerateFaults(c);
    for (const f of faults) {
      if (!windowHolds(c, f)) continue;
      considered++;
      const seq = solveUnder(c, f);
      if (seq) solutions.push({ fault: f, seq });
    }
    if (solutions.length === 0) {
      // 理论上不可达：前面的并集已判定 unexplainable，防御性返回首帧。
      return {
        kind: 'unexplainable',
        firstDeadFrame: 0,
        frameLights: input.frames[0].lights,
      };
    }
  }

  solutions.sort((a, b) => {
    // 1. 无故障优先（null 已单独短路，此处仅故障之间排序）
    const fa = a.fault!;
    const fb = b.fault!;
    // 2. 故障窗最短
    const la = fa.end - fa.start;
    const lb = fb.end - fb.start;
    if (la !== lb) return la - lb;
    // 3. 灯路登记顺序
    if (fa.lamp !== fb.lamp) return fa.lamp - fb.lamp;
    // 4. 起帧最早
    if (fa.start !== fb.start) return fa.start - fb.start;
    // 5. 状态序列字典序（编号比较，页面按登记顺序展示）
    for (let t = 0; t < a.seq.length; t++) {
      if (a.seq[t] !== b.seq[t]) return a.seq[t] - b.seq[t];
    }
    return 0;
  });

  const best = solutions[0];
  return {
    kind: 'ok',
    fault: best.fault,
    stateSequence: best.seq.map((s) => c.states[s].id),
    evidence: buildEvidence(c, best.seq, best.fault),
    considered,
  };
}

function buildEvidence(
  c: Compiled,
  seq: number[],
  fault: FaultWindow | null,
): FrameEvidence[] {
  return seq.map((s, t) => {
    const prev = t === 0 ? -1 : seq[t - 1];
    const transition: FrameEvidence['transitionFromPrev'] =
      t === 0 ? 'start' : prev === s ? 'stay' : 'switch';
    return {
      frame: t,
      stateId: c.states[s].id,
      stateName: c.states[s].name,
      transitionFromPrev: transition,
      prevStateId: t === 0 ? null : c.states[prev].id,
      prevStateName: t === 0 ? null : c.states[prev].name,
      lamps: Array.from({ length: c.m }, (_, k) => {
        const isFault =
          fault !== null &&
          k === fault.lamp &&
          t >= fault.start &&
          t <= fault.end;
        return {
          observed: c.obs[t][k] === 1 ? '1' : '0',
          expected: c.expect[s][k] === 1 ? '1' : '0',
          status: isFault ? ('fault' as const) : ('match' as const),
        };
      }),
    };
  });
}
