/**
 * 轨迹求解冒烟：在无浏览器环境下直接调用求解器，
 * 覆盖正常 / 单灯路卡滞故障 / 不可解释三类轨迹，任一断言失败则以非零码退出。
 */
import { explain } from '../src/solver/solver';
import { createDefaultScenario } from '../src/solver/defaults';
import type { Bit, Scenario } from '../src/solver/types';

let failures = 0;
function check(cond: boolean, message: string): void {
  if (cond) {
    console.log(`  ok - ${message}`);
  } else {
    console.error(`  FAIL - ${message}`);
    failures += 1;
  }
}

console.log('冒烟 1：默认示例应零故障解释出 6 帧状态轨迹');
{
  const r = explain(createDefaultScenario());
  check(r.status === 'normal', '状态为 normal');
  check(r.path.length === 6, '逐帧状态长度为 6');
  check(r.fault === null, '无故障信息');
  check(
    r.evidence.every((e) => e.lamps.every((l) => l.match && !l.ignored)),
    '每帧每路灯均精确吻合',
  );
}

console.log('冒烟 2：单灯路连续两帧卡滞应给出最短窗故障轨迹');
{
  const sc: Scenario = {
    lampOrder: ['L1', 'L2', 'L3'],
    states: [
      { name: 'S0', lamps: ['0', '0', '0'] },
      { name: 'S1', lamps: ['1', '0', '0'] },
      { name: 'S2', lamps: ['1', '1', '0'] },
      { name: 'S3', lamps: ['1', '1', '1'] },
    ],
    edges: [
      { from: 'S0', to: 'S1' },
      { from: 'S1', to: 'S2' },
      { from: 'S2', to: 'S3' },
    ],
    frames: (
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [1, 1, 0],
        [1, 1, 0],
      ] as Bit[][]
    ).map((observed) => ({ observed: observed.map(String) })),
  };
  const r = explain(sc);
  check(r.status === 'fault', '状态为 fault');
  check(r.fault?.lampName === 'L1', '卡滞灯路为 L1');
  check(r.fault?.startFrame === 2, '起帧为第 3 帧');
  check(r.fault?.windowLength === 2, '故障窗长度为 2（最短）');
  check(r.path.length === 6, '逐帧状态长度为 6');
}

console.log('冒烟 3：完全无法解释时报告最早死帧与该帧灯态');
{
  const sc: Scenario = {
    lampOrder: ['L1', 'L2', 'L3'],
    states: [
      { name: 'S0', lamps: ['0', '0', '0'] },
      { name: 'S1', lamps: ['1', '0', '0'] },
      { name: 'S2', lamps: ['1', '1', '0'] },
      { name: 'S3', lamps: ['1', '1', '1'] },
    ],
    edges: [
      { from: 'S0', to: 'S1' },
      { from: 'S1', to: 'S2' },
      { from: 'S2', to: 'S3' },
    ],
    frames: (
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [1, 1, 0],
        [0, 1, 1],
      ] as Bit[][]
    ).map((observed) => ({ observed: observed.map(String) })),
  };
  const r = explain(sc);
  check(r.status === 'unexplainable', '状态为 unexplainable');
  check(r.unexplainable?.frameIndex === 5, '最早死帧为第 6 帧');
  check(
    JSON.stringify(r.unexplainable?.observed) === '[0,1,1]',
    '该帧灯态为 011',
  );
}

if (failures > 0) {
  console.error(`冒烟失败：${failures} 项断言未通过`);
  process.exit(1);
}
console.log('轨迹求解冒烟全部通过。');
