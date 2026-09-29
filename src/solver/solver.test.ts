import { describe, expect, it } from 'vitest';
import { explain } from './solver';
import type { Bit, Frame, Scenario, StateDef } from './types';

function state(name: string, lamps: Bit[]): StateDef {
  return { name, lamps: lamps.map(String) };
}
function frame(observed: Bit[]): Frame {
  return { observed: observed.map(String) };
}

/** 4 状态 3 灯路：S0..S3，登记边为 0→1→2→3（另有自环） */
function chainScenario(frames: Bit[][]): Scenario {
  return {
    lampOrder: ['L1', 'L2', 'L3'],
    states: [
      state('S0', [0, 0, 0]),
      state('S1', [1, 0, 0]),
      state('S2', [1, 1, 0]),
      state('S3', [1, 1, 1]),
    ],
    edges: [
      { from: 'S0', to: 'S1' },
      { from: 'S1', to: 'S2' },
      { from: 'S2', to: 'S3' },
    ],
    frames: frames.map(frame),
  };
}

describe('零故障优先', () => {
  it('精确吻合 + 自环与沿边切换时判为正常', () => {
    const sc = chainScenario([
      [0, 0, 0],
      [0, 0, 0], // 自环
      [1, 0, 0], // 沿边 S0→S1
      [1, 0, 0],
      [1, 1, 0], // S1→S2
      [1, 1, 1], // S2→S3
    ]);
    const r = explain(sc);
    expect(r.status).toBe('normal');
    expect(r.path).toEqual(['S0', 'S0', 'S1', 'S1', 'S2', 'S3']);
    expect(r.fault).toBeNull();
    expect(r.evidence[0].transition).toBeNull();
    expect(r.evidence[1].transition).toBe('self');
    expect(r.evidence[2].transition).toBe('edge');
  });

  it('首步观测与所有可达状态相差两灯以上时不可解释（自环/沿边/卡滞均不可达）', () => {
    // 011 与 S0(000)、S1(100) 均相差两灯：忽略任何一路都无法在 S0 的后继中相容
    const sc = chainScenario([
      [0, 0, 0],
      [0, 1, 1],
      [0, 1, 1],
      [0, 1, 1],
      [0, 1, 1],
      [0, 1, 1],
    ]);
    const r = explain(sc);
    expect(r.status).toBe('unexplainable');
    expect(r.unexplainable?.frameIndex).toBe(1);
    expect(r.unexplainable?.observed).toEqual([0, 1, 1]);
  });
});

describe('单灯路卡滞故障', () => {
  it('一灯连续两帧卡值、窗外精确吻合时判为故障并给出证据', () => {
    // 帧 2、3 位于 S1 但 L1 卡在 0；帧 4 沿边到 S2
    const sc = chainScenario([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0], // L1 应为 1，观测 0（卡滞）
      [0, 0, 0], // L1 应为 1，观测 0（卡滞）
      [1, 1, 0],
      [1, 1, 0], // S2 自环
    ]);
    const r = explain(sc);
    expect(r.status).toBe('fault');
    expect(r.fault?.lampName).toBe('L1');
    expect(r.fault?.startFrame).toBe(2);
    expect(r.fault?.endFrame).toBe(3);
    expect(r.fault?.windowLength).toBe(2);
    expect(r.fault?.stuckValue).toBe(0);
    // 字典序：帧 2 停在 S0（S0→S1 推迟到帧 3）
    expect(r.path).toEqual(['S0', 'S0', 'S0', 'S1', 'S2', 'S2']);
    const e2 = r.evidence[2].lamps[0];
    expect(e2.ignored).toBe(true);
    expect(e2.match).toBe(true);
    expect(e2.expected).toBe(0); // 帧 2 状态为 S0
    const e3 = r.evidence[3].lamps[0];
    expect(e3.ignored).toBe(true);
    expect(e3.expected).toBe(1); // 帧 3 状态为 S1
    expect(r.evidence[2].inFaultWindow).toBe(true);
    expect(r.evidence[0].inFaultWindow).toBe(false);
  });

  it('孤立的单帧异常（无法形成连续两帧卡滞）不可解释', () => {
    // 010 不对应链上任何状态；可在帧 2 临时开窗，但帧 3 的 100 无法续窗/闭窗，
    // 因此最早确认的死点为帧 3
    const sc = chainScenario([
      [0, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ]);
    const r = explain(sc);
    expect(r.status).toBe('unexplainable');
    expect(r.unexplainable?.frameIndex).toBe(3);
  });

  it('故障窗优先取最短：长度 2 均不可行时取长度 3 的窗', () => {
    // A=000, B=110, C=111；帧 2..4 恒为 010（B 态但 L1 卡 0）。
    // 任何长度 2 的窗都会把窗外某帧留给不存在的精确灯态 010，唯有 [2,4] 可行。
    const sc: Scenario = {
      lampOrder: ['L1', 'L2', 'L3'],
      states: [
        state('A', [0, 0, 0]),
        state('B', [1, 1, 0]),
        state('C', [1, 1, 1]),
        state('D', [0, 0, 1]),
      ],
      edges: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'C', to: 'D' },
      ],
      frames: [
        frame([0, 0, 0]),
        frame([1, 1, 0]),
        frame([0, 1, 0]),
        frame([0, 1, 0]),
        frame([0, 1, 0]),
        frame([1, 1, 1]),
      ],
    };
    const r = explain(sc);
    expect(r.status).toBe('fault');
    expect(r.fault?.lampName).toBe('L1');
    expect(r.fault?.startFrame).toBe(2);
    expect(r.fault?.windowLength).toBe(3);
    expect(r.path).toEqual(['A', 'B', 'B', 'B', 'B', 'C']);
  });

  it('灯路登记顺序优先：多灯同长同窗可解释时取登记靠前的灯路', () => {
    // 窗内观测 000：对 P=100 可解释为 L1 卡 0，对 Q=001 可解释为 L3 卡 0；
    // P、Q 均有 A→? 与 ?→R 的登记边，两条全程解并存，按登记顺序取 L1。
    const sc: Scenario = {
      lampOrder: ['L1', 'L2', 'L3'],
      states: [
        state('A', [0, 0, 0]),
        state('P', [1, 0, 0]),
        state('Q', [0, 0, 1]),
        state('R', [1, 1, 1]),
      ],
      edges: [
        { from: 'A', to: 'P' },
        { from: 'A', to: 'Q' },
        { from: 'P', to: 'R' },
        { from: 'Q', to: 'R' },
      ],
      frames: [
        frame([0, 0, 0]),
        frame([0, 0, 0]),
        frame([0, 0, 0]),
        frame([0, 0, 0]),
        frame([1, 1, 1]),
        frame([1, 1, 1]),
      ],
    };
    const r = explain(sc);
    expect(r.status).toBe('fault');
    expect(r.fault?.lampName).toBe('L1');
    expect(r.fault?.startFrame).toBe(2);
    expect(r.fault?.windowLength).toBe(2);
    // 字典序：帧 2 可停在 A（A→P 推迟到帧 3），窗内 L1 读数 0 与 A 的期望 0 相容
    expect(r.path).toEqual(['A', 'A', 'A', 'P', 'R', 'R']);
  });
});

describe('不可解释报告', () => {
  it('指出按帧顺序最早已无可达状态的位置和该帧灯态', () => {
    const sc = chainScenario([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 1], // 不对应任何状态，且无卡滞窗可覆盖
    ]);
    const r = explain(sc);
    expect(r.status).toBe('unexplainable');
    expect(r.unexplainable?.frameIndex).toBe(5);
    expect(r.unexplainable?.observed).toEqual([0, 1, 1]);
  });

  it('首帧即与所有状态相差两灯以上（含任何开窗）时报告第 0 帧', () => {
    // 四个状态灯态均为 000；首帧 110 与其相差两灯，忽略任一路仍不相容
    const sc: Scenario = {
      lampOrder: ['L1', 'L2', 'L3'],
      states: [
        state('A', [0, 0, 0]),
        state('B', [0, 0, 0]),
        state('C', [0, 0, 0]),
        state('D', [0, 0, 0]),
      ],
      edges: [],
      frames: [
        frame([1, 1, 0]),
        frame([0, 0, 0]),
        frame([0, 0, 0]),
        frame([0, 0, 0]),
        frame([0, 0, 0]),
        frame([0, 0, 0]),
      ],
    };
    const r = explain(sc);
    expect(r.status).toBe('unexplainable');
    expect(r.unexplainable?.frameIndex).toBe(0);
    expect(r.unexplainable?.observed).toEqual([1, 1, 0]);
  });

  it('死点判定联合所有故障假设：开窗可越过零故障死点，在真正不可达处报告', () => {
    // 零故障在帧 1（010 无精确状态）即死；但 L1 窗 [1,2] 可解释 010（B 态），
    // 帧 3 精确回到 B，直到帧 4 的 101 才再无任何沿边可达的解释。
    const sc: Scenario = {
      lampOrder: ['L1', 'L2', 'L3'],
      states: [
        state('A', [0, 0, 0]),
        state('B', [1, 1, 0]),
        state('C', [1, 1, 1]),
        state('D', [0, 0, 1]),
      ],
      edges: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
      ],
      frames: [
        frame([0, 0, 0]),
        frame([0, 1, 0]),
        frame([0, 1, 0]),
        frame([1, 1, 0]),
        frame([1, 0, 1]),
        frame([1, 1, 1]),
      ],
    };
    const r = explain(sc);
    expect(r.status).toBe('unexplainable');
    expect(r.unexplainable?.frameIndex).toBe(4);
    expect(r.unexplainable?.observed).toEqual([1, 0, 1]);
  });
});

describe('状态序列字典序', () => {
  it('同一假设多解时取状态名字典序最小序列', () => {
    // 四个状态灯态完全相同；自环总允许，故全程可取名字最小的 A
    const sc: Scenario = {
      lampOrder: ['L1', 'L2', 'L3'],
      states: [
        state('Z', [0, 0, 0]),
        state('A', [0, 0, 0]),
        state('M', [0, 0, 0]),
        state('B', [0, 0, 0]),
      ],
      edges: [
        { from: 'A', to: 'Z' },
        { from: 'Z', to: 'M' },
        { from: 'M', to: 'B' },
      ],
      frames: Array.from({ length: 6 }, () => frame([0, 0, 0])),
    };
    const r = explain(sc);
    expect(r.status).toBe('normal');
    expect(r.path).toEqual(['A', 'A', 'A', 'A', 'A', 'A']);
  });
});
