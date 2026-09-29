import type {
  Bit,
  ExplainResult,
  FaultInfo,
  FrameEvidence,
  LampEvidence,
  Scenario,
} from './types';

/** 一个故障假设：null 表示零故障；否则灯路 k 自 startFrame 起卡在 value */
interface Hypothesis {
  lampIndex: number;
  startFrame: number;
  endFrame: number;
  value: Bit;
}

interface Compiled {
  stateNames: string[];
  lampNames: string[];
  /** statePatterns[stateIndex][lampIndex] */
  statePatterns: Bit[][];
  /** 每个状态的后继下标（含自环与登记边，已去重） */
  successors: Set<number>[];
  /** 每帧观测，observedFrames[t][lampIndex] */
  observedFrames: Bit[][];
  indexByName: Map<string, number>;
}

function compile(scenario: Scenario): Compiled {
  const stateNames = scenario.states.map((s) => s.name);
  const lampNames = [...scenario.lampOrder];
  const indexByName = new Map(stateNames.map((name, i) => [name, i]));

  const statePatterns = scenario.states.map((s) =>
    s.lamps.map((v) => Number(v) as Bit),
  );
  const observedFrames = scenario.frames.map((f) =>
    f.observed.map((v) => Number(v) as Bit),
  );

  const successors = stateNames.map((_, i) => new Set<number>([i]));
  for (const edge of scenario.edges) {
    const a = indexByName.get(edge.from);
    const b = indexByName.get(edge.to);
    if (a !== undefined && b !== undefined) successors[a].add(b);
  }

  return {
    stateNames,
    lampNames,
    statePatterns,
    successors,
    observedFrames,
    indexByName,
  };
}

/** 判定状态 si 在帧 t 是否与观测相容（hyp 为故障假设时，窗内忽略该灯路） */
function compatible(
  c: Compiled,
  si: number,
  t: number,
  hyp: Hypothesis | null,
): boolean {
  const obs = c.observedFrames[t];
  const pat = c.statePatterns[si];
  for (let k = 0; k < obs.length; k++) {
    if (hyp && hyp.lampIndex === k && t >= hyp.startFrame && t <= hyp.endFrame) {
      continue; // 卡滞窗内：该灯路期望值被忽略
    }
    if (obs[k] !== pat[k]) return false;
  }
  return true;
}

/** 故障假设是否合法：窗内该灯路观测必须恒定为卡住值 */
function hypothesisValid(c: Compiled, hyp: Hypothesis): boolean {
  for (let t = hyp.startFrame; t <= hyp.endFrame; t++) {
    if (c.observedFrames[t][hyp.lampIndex] !== hyp.value) return false;
  }
  return true;
}

interface PathSolution {
  path: number[];
}

/**
 * 给定各帧允许（相容）状态集合，做前向可达 + 反向可达，
 * 再用贪心构造字典序最小的可行状态序列。
 * 任一帧允许集为空或中途不可达则无解。
 */
function solvePath(c: Compiled, allowed: Set<number>[]): PathSolution | null {
  const n = allowed.length;
  const reachable: Set<number>[] = [];
  reachable[0] = new Set(allowed[0]);
  if (reachable[0].size === 0) return null;

  for (let t = 1; t < n; t++) {
    const cur = new Set<number>();
    for (const prev of reachable[t - 1]) {
      for (const s of c.successors[prev]) {
        if (allowed[t].has(s)) cur.add(s);
      }
    }
    if (cur.size === 0) return null;
    reachable[t] = cur;
  }

  // 反向可达：保留确实能走到末帧候选集的状态
  const backward: Set<number>[] = new Array(n);
  backward[n - 1] = new Set(reachable[n - 1]);
  for (let t = n - 2; t >= 0; t--) {
    const cur = new Set<number>();
    for (const s of reachable[t]) {
      for (const nx of c.successors[s]) {
        if (backward[t + 1].has(nx)) {
          cur.add(s);
          break;
        }
      }
    }
    backward[t] = cur;
  }
  if (backward[0].size === 0) return null;

  // 贪心：每帧取当前可行（有后继且能走完全程）的最小状态名序号，
  // 由此得到字典序最小的全程状态序列。
  const path: number[] = new Array(n);
  let first = -1;
  for (const s of backward[0]) {
    if (first === -1 || c.stateNames[s] < c.stateNames[first]) first = s;
  }
  path[0] = first;
  for (let t = 1; t < n; t++) {
    let pick = -1;
    for (const s of backward[t]) {
      if (!c.successors[path[t - 1]].has(s)) continue;
      if (pick === -1 || c.stateNames[s] < c.stateNames[pick]) pick = s;
    }
    if (pick === -1) return null; // 理论上不会发生
    path[t] = pick;
  }
  return { path };
}

function allowedSets(c: Compiled, hyp: Hypothesis | null): Set<number>[] {
  const n = c.observedFrames.length;
  const sets: Set<number>[] = [];
  for (let t = 0; t < n; t++) {
    const set = new Set<number>();
    for (let si = 0; si < c.stateNames.length; si++) {
      if (compatible(c, si, t, hyp)) set.add(si);
    }
    sets.push(set);
  }
  return sets;
}

/**
 * 按裁决优先级枚举故障假设：
 * 故障窗长度 ↑ → 灯路登记顺序 ↑ → 起帧 ↑（窗内恒值合法性决定卡住值，至多一个）。
 */
function* hypotheses(c: Compiled): Generator<Hypothesis> {
  const n = c.observedFrames.length;
  const lampCount = c.lampNames.length;
  for (let len = 2; len <= n; len++) {
    for (let k = 0; k < lampCount; k++) {
      for (let start = 0; start + len <= n; start++) {
        const end = start + len - 1;
        for (const value of [0, 1] as Bit[]) {
          const hyp = { lampIndex: k, startFrame: start, endFrame: end, value };
          if (hypothesisValid(c, hyp)) yield hyp;
        }
      }
    }
  }
}

function buildEvidence(
  c: Compiled,
  path: number[],
  hyp: Hypothesis | null,
): FrameEvidence[] {
  return path.map((si, t) => {
    const lamps: LampEvidence[] = c.lampNames.map((lampName, k) => {
      const observed = c.observedFrames[t][k];
      const expected = c.statePatterns[si][k];
      const ignored =
        !!hyp && hyp.lampIndex === k && t >= hyp.startFrame && t <= hyp.endFrame;
      return {
        lampIndex: k,
        lampName,
        observed,
        expected,
        match: ignored || observed === expected,
        ignored,
      };
    });

    let transition: FrameEvidence['transition'] = null;
    if (t > 0) {
      transition = path[t] === path[t - 1] ? 'self' : 'edge';
    }

    return {
      frameIndex: t,
      stateName: c.stateNames[si],
      transition,
      lamps,
      inFaultWindow:
        !!hyp && t >= hyp.startFrame && t <= hyp.endFrame,
    };
  });
}

function toFaultInfo(c: Compiled, hyp: Hypothesis): FaultInfo {
  return {
    lampIndex: hyp.lampIndex,
    lampName: c.lampNames[hyp.lampIndex],
    startFrame: hyp.startFrame,
    endFrame: hyp.endFrame,
    stuckValue: hyp.value,
    windowLength: hyp.endFrame - hyp.startFrame + 1,
  };
}

/** 状态在帧 t 是否与观测逐灯精确吻合 */
function exactMatch(c: Compiled, si: number, t: number): boolean {
  const obs = c.observedFrames[t];
  const pat = c.statePatterns[si];
  for (let k = 0; k < obs.length; k++) {
    if (obs[k] !== pat[k]) return false;
  }
  return true;
}

/** 除第 ignoreLamp 路外其余灯精确吻合（用于卡滞窗内） */
function othersMatch(
  c: Compiled,
  si: number,
  t: number,
  ignoreLamp: number,
): boolean {
  const obs = c.observedFrames[t];
  const pat = c.statePatterns[si];
  for (let k = 0; k < obs.length; k++) {
    if (k === ignoreLamp) continue;
    if (obs[k] !== pat[k]) return false;
  }
  return true;
}

/**
 * 无法解释时，按帧顺序定位最早「无论有无故障都已无可达状态」的观测位置。
 * 在线维护三类解释模式（模式间沿登记边/自环转移）：
 *  - normal：尚未发生故障；
 *  - open(k,v,start)：灯路 k 自 startFrame 起卡在 v，窗尚未闭合（窗内观测须恒为 v）；
 *  - closed：曾有一条长度 ≥2 的窗已闭合，此后逐灯精确吻合。
 * 窗可在任意帧打开，仅当累计至少两帧时才允许闭合或在末帧保持打开。
 */
function earliestDeadFrame(c: Compiled): number | null {
  const n = c.observedFrames.length;

  let normal = new Set<number>();
  let closed = new Set<number>();
  /** 键 `灯路/卡住值/起帧` -> 可达状态集 */
  let open = new Map<string, { key: OpenKey; states: Set<number> }>();

  // 帧 0：任意状态都可作为起点
  const obs0 = c.observedFrames[0];
  for (let si = 0; si < c.stateNames.length; si++) {
    if (exactMatch(c, si, 0)) normal.add(si);
    for (let k = 0; k < obs0.length; k++) {
      if (othersMatch(c, si, 0, k)) {
        const key: OpenKey = { k, v: obs0[k], start: 0 };
        addOpen(open, key, si);
      }
    }
  }
  if (isEmpty(normal, open, closed)) return 0;

  for (let t = 1; t < n; t++) {
    const obs = c.observedFrames[t];
    const nextNormal = new Set<number>();
    const nextClosed = new Set<number>();
    const nextOpen = new Map<string, { key: OpenKey; states: Set<number> }>();

    // 无故障延续
    for (const s of normal) {
      for (const nx of c.successors[s]) {
        if (exactMatch(c, nx, t)) nextNormal.add(nx);
      }
    }

    // 已闭合故障延续（精确吻合）
    for (const s of closed) {
      for (const nx of c.successors[s]) {
        if (exactMatch(c, nx, t)) nextClosed.add(nx);
      }
    }

    for (const { key, states } of open.values()) {
      for (const s of states) {
        for (const nx of c.successors[s]) {
          // 窗继续：该灯路观测仍为卡住值，其余灯吻合
          if (obs[key.k] === key.v && othersMatch(c, nx, t, key.k)) {
            addOpen(nextOpen, key, nx);
          }
          // 窗在本帧之前闭合（已覆盖至少两帧），当前帧精确吻合
          if (t - key.start >= 2 && exactMatch(c, nx, t)) {
            nextClosed.add(nx);
          }
        }
      }
    }

    // 无故障模式在本帧新打开一条窗（末帧打开的长度 1 窗永不可能合法，忽略）
    if (t < n - 1) {
      for (const s of normal) {
        for (const nx of c.successors[s]) {
          for (let k = 0; k < obs.length; k++) {
            if (othersMatch(c, nx, t, k)) {
              addOpen(nextOpen, { k, v: obs[k], start: t }, nx);
            }
          }
        }
      }
    }

    normal = nextNormal;
    closed = nextClosed;
    open = nextOpen;
    if (isEmpty(normal, open, closed)) return t;
  }
  return null;
}

interface OpenKey {
  k: number;
  v: Bit;
  start: number;
}

function openKeyId(key: OpenKey): string {
  return `${key.k}:${key.v}:${key.start}`;
}

function addOpen(
  map: Map<string, { key: OpenKey; states: Set<number> }>,
  key: OpenKey,
  si: number,
): void {
  const id = openKeyId(key);
  let entry = map.get(id);
  if (!entry) {
    entry = { key, states: new Set<number>() };
    map.set(id, entry);
  }
  entry.states.add(si);
}

function isEmpty(
  normal: Set<number>,
  open: Map<string, { states: Set<number> }>,
  closed: Set<number>,
): boolean {
  if (normal.size > 0 || closed.size > 0) return false;
  for (const entry of open.values()) {
    if (entry.states.size > 0) return false;
  }
  return true;
}

/**
 * 联合选择全程状态并裁决：
 * 1) 优先零故障；
 * 2) 否则按「窗长 ↑ 灯路 ↑ 起帧 ↑」取首个可行的卡滞假设，同假设内取状态序列字典序最小；
 * 3) 全部假设均不可解释时，报告按帧顺序最早已无可达状态的位置与该帧灯态。
 */
export function explain(scenario: Scenario): ExplainResult {
  const c = compile(scenario);

  const consider = (hyp: Hypothesis | null): number[] | null => {
    const sets = allowedSets(c, hyp);
    const sol = solvePath(c, sets);
    return sol ? sol.path : null;
  };

  // 1) 零故障
  const noFaultPath = consider(null);
  if (noFaultPath) {
    return {
      status: 'normal',
      path: noFaultPath.map((i) => c.stateNames[i]),
      fault: null,
      evidence: buildEvidence(c, noFaultPath, null),
      unexplainable: null,
    };
  }

  // 2) 枚举单灯路卡滞假设（优先级顺序）
  for (const hyp of hypotheses(c)) {
    const path = consider(hyp);
    if (path) {
      return {
        status: 'fault',
        path: path.map((i) => c.stateNames[i]),
        fault: toFaultInfo(c, hyp),
        evidence: buildEvidence(c, path, hyp),
        unexplainable: null,
      };
    }
  }

  // 3) 无法解释：联合所有允许的故障模式，定位最早空可达帧
  const dead = earliestDeadFrame(c) ?? 0;
  return {
    status: 'unexplainable',
    path: [],
    fault: null,
    evidence: [],
    unexplainable: {
      frameIndex: dead,
      observed: c.observedFrames[dead].map((b) => b as Bit | null),
    },
  };
}
