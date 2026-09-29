import { describe, expect, it } from 'vitest';
import { review } from './solver';
import type { ReviewInput, StateDef, Transition } from './types';

function state(id: string, name: string, lights: string): StateDef {
  return { id, name, lights };
}

function makeInput(
  states: Array<[string, string, string]>,
  edges: Array<[string, string]>,
  frames: string[],
): ReviewInput {
  return {
    states: states.map(([id, name, lights]) => state(id, name, lights)),
    transitions: edges.map(([from, to]) => ({ from, to }) as Transition),
    frames: frames.map((lights) => ({ lights })),
  };
}

describe('review 无故障场景', () => {
  it('沿登记边精确吻合时给出无故障全程序列', () => {
    const input = makeInput(
      [
        ['a', 'A供电', '100'],
        ['m', '切换中', '110'],
        ['b', 'B供电', '010'],
        ['d', '双供', '111'],
      ],
      [
        ['a', 'm'],
        ['m', 'b'],
        ['a', 'd'],
      ],
      ['100', '100', '110', '010', '010', '010'],
    );
    const r = review(input);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.fault).toBeNull();
    expect(r.stateSequence).toEqual(['a', 'a', 'm', 'b', 'b', 'b']);
    expect(r.evidence.map((e) => e.transitionFromPrev)).toEqual([
      'start',
      'stay',
      'switch',
      'switch',
      'stay',
      'stay',
    ]);
    expect(
      r.evidence.every((e) => e.lamps.every((l) => l.status === 'match')),
    ).toBe(true);
  });

  it('未登记的切换不可达（且单灯故障无法弥补两灯差异）时报告最早死帧及该帧灯态', () => {
    const input = makeInput(
      [
        ['a', 'A供电', '100'],
        ['m', '切换中', '110'],
        ['b', 'B供电', '011'],
        ['d', '双供', '111'],
      ],
      [['a', 'm']], // 缺少 m→b，且 110 与 011 有两灯不同
      ['100', '100', '110', '011', '011', '011'],
    );
    const r = review(input);
    expect(r.kind).toBe('unexplainable');
    if (r.kind !== 'unexplainable') return;
    expect(r.firstDeadFrame).toBe(3);
    expect(r.frameLights).toBe('011');
  });

  it('首帧观测与所有状态相差两灯以上时定位到第 1 帧', () => {
    const input = makeInput(
      [
        ['a', 'A供电', '110'],
        ['m', '切换中', '101'],
        ['b', 'B供电', '011'],
        ['d', '双供', '111'],
      ],
      [['a', 'm']],
      ['000', '110', '110', '110', '110', '110'],
    );
    const r = review(input);
    expect(r.kind).toBe('unexplainable');
    if (r.kind !== 'unexplainable') return;
    expect(r.firstDeadFrame).toBe(0);
    expect(r.frameLights).toBe('000');
  });
});

describe('review 单灯路卡滞', () => {
  it('识别一条灯路连续两帧卡住，窗外精确吻合', () => {
    const input = makeInput(
      [
        ['a', 'A供电', '100'],
        ['b', 'B供电', '010'],
        ['x', '备用X', '001'],
        ['y', '备用Y', '111'],
      ],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
      // 真实序列 a b b b a a；b 态灯0应为 0，t1/t2 被卡为 1
      ['100', '110', '110', '010', '100', '100'],
    );
    const r = review(input);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.fault).toEqual({ lamp: 0, start: 1, end: 2, value: '1' });
    expect(r.stateSequence).toEqual(['a', 'b', 'b', 'b', 'a', 'a']);
    const faultLamps = r.evidence.flatMap((e) =>
      e.lamps
        .filter((l) => l.status === 'fault')
        .map((l) => ({ frame: e.frame, observed: l.observed, expected: l.expected })),
    );
    expect(faultLamps).toEqual([
      { frame: 1, observed: '1', expected: '0' },
      { frame: 2, observed: '1', expected: '0' },
    ]);
  });

  it('单帧异常且无法借用相邻同值帧构成窗时，应无法解释', () => {
    const input = makeInput(
      [
        ['a', 'A供电', '100'],
        ['b', 'B供电', '010'],
        ['x', '备用X', '001'],
        ['y', '备用Y', '111'],
      ],
      [['a', 'b']], // 仅 a→b，进入 b 后只能保持
      // 真实 a a b b b b；t3 灯2 单帧异常为 1（灯2 同值游程仅一帧）
      ['100', '100', '010', '011', '010', '010'],
    );
    const r = review(input);
    expect(r.kind).toBe('unexplainable');
    if (r.kind !== 'unexplainable') return;
    expect(r.firstDeadFrame).toBe(3);
    expect(r.frameLights).toBe('011');
  });

  it('同灯同起点存在多个可行窗时优先最短故障窗', () => {
    const input = makeInput(
      [
        ['a', 'A供电', '000'],
        ['b', 'B供电', '100'],
        ['c', 'C供电', '010'],
        ['x', '备用X', '001'],
      ],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
      ],
      // 真实 a b c c a a；灯1 在 t1 应为 0 却读到 1，t2 起自然为 1。
      // [1,2] 与 [1,3] 均可行，应取长度 2 的 [1,2]。
      ['000', '110', '010', '010', '000', '000'],
    );
    const r = review(input);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.fault).toEqual({ lamp: 1, start: 1, end: 2, value: '1' });
    expect(r.stateSequence).toEqual(['a', 'b', 'c', 'c', 'a', 'a']);
  });

  it('窗长相同时按灯路登记顺序择优', () => {
    const input = makeInput(
      [
        ['a', 'A供电', '000'],
        ['x', 'X态', '101'],
        ['y', 'Y态', '110'],
        ['z', 'Z态', '111'],
      ],
      [
        ['a', 'x'],
        ['a', 'y'],
        ['x', 'a'],
        ['y', 'a'],
      ],
      // t1/t2 观测 111：灯1卡→真态 X(101)；灯2卡→真态 Y(110)，应取灯1
      ['000', '111', '111', '000', '000', '000'],
    );
    const r = review(input);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.fault?.lamp).toBe(1);
    expect(r.stateSequence).toEqual(['a', 'x', 'x', 'a', 'a', 'a']);
  });

  it('无故障假设优先于任何卡滞假设', () => {
    const input = makeInput(
      [
        ['a', 'A供电', '100'],
        ['b', 'B供电', '110'],
        ['x', '备用X', '001'],
        ['y', '备用Y', '111'],
      ],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
      ['100', '110', '110', '110', '100', '100'],
    );
    const r = review(input);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.fault).toBeNull();
    expect(r.stateSequence).toEqual(['a', 'b', 'b', 'b', 'a', 'a']);
  });

  it('多状态可继续时状态序列取字典序（登记顺序）最小', () => {
    const input = makeInput(
      [
        ['a', 'A供电', '000'],
        ['x', 'X态', '000'],
        ['b', 'B供电', '110'],
        ['y', 'Y态', '111'],
      ],
      [
        ['a', 'b'],
        ['x', 'b'],
        ['b', 'a'],
        ['b', 'x'],
      ],
      ['000', '000', '110', '000', '000', '000'],
    );
    const r = review(input);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.fault).toBeNull();
    // t0/t1 在 a 与 x 间均可，t3 起同样均可；一律取登记靠前的 a
    expect(r.stateSequence).toEqual(['a', 'a', 'b', 'a', 'a', 'a']);
  });
});

describe('review 校验', () => {
  it('状态数越界抛出可读错误', () => {
    const base = makeInput(
      [
        ['a', 'A', '100'],
        ['b', 'B', '110'],
      ],
      [],
      ['100', '100', '100', '100', '100', '100'],
    );
    expect(() => review(base)).toThrow(/状态数量/);
  });
});
