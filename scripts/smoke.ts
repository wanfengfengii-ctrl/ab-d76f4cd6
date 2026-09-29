/**
 * 轨迹求解冒烟：不依赖浏览器/DOM，直接跑求解器三个关键场景。
 * verify 服务在容器内执行；任一断言失败以非零退出码报告。
 */
import { review } from '../src/solver/solver';
import type { ReviewInput } from '../src/solver/types';

function input(
  states: Array<[string, string, string]>,
  edges: Array<[string, string]>,
  frames: string[],
): ReviewInput {
  return {
    states: states.map(([id, name, lights]) => ({ id, name, lights })),
    transitions: edges.map(([from, to]) => ({ from, to })),
    frames: frames.map((lights) => ({ lights })),
  };
}

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name}`, detail ?? '');
  }
}

console.log('冒烟 1：无故障轨迹（保持 + 沿登记边切换）');
{
  const r = review(
    input(
      [
        ['a', 'Ⅰ段供电', '100'],
        ['m', '切换中', '110'],
        ['b', 'Ⅱ段供电', '010'],
        ['d', '双母并列', '111'],
      ],
      [
        ['a', 'm'],
        ['m', 'b'],
      ],
      ['100', '100', '110', '010', '010', '010'],
    ),
  );
  check('结果可解', r.kind === 'ok');
  if (r.kind === 'ok') {
    check('无故障', r.fault === null);
    check('全程序列正确', r.stateSequence.join(',') === 'a,a,m,b,b,b');
    check('证据帧数为 6', r.evidence.length === 6);
  }
}

console.log('冒烟 2：单灯路连续两帧卡滞');
{
  const r = review(
    input(
      [
        ['a', 'Ⅰ段供电', '100'],
        ['b', 'Ⅱ段供电', '010'],
        ['x', '备用X', '001'],
        ['y', '备用Y', '111'],
      ],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
      ['100', '110', '110', '010', '100', '100'],
    ),
  );
  check('结果可解', r.kind === 'ok');
  if (r.kind === 'ok') {
    check('定位 L1 第2-3帧卡为 1', JSON.stringify(r.fault) === JSON.stringify({ lamp: 0, start: 1, end: 2, value: '1' }), r.fault);
    check('全程序列正确', r.stateSequence.join(',') === 'a,b,b,b,a,a');
  }
}

console.log('冒烟 3：无法解释时报告最早死帧与该帧灯态');
{
  const r = review(
    input(
      [
        ['a', 'Ⅰ段供电', '100'],
        ['m', '切换中', '110'],
        ['b', 'Ⅱ段供电', '011'],
        ['d', '双母并列', '111'],
      ],
      [['a', 'm']],
      ['100', '100', '110', '011', '011', '011'],
    ),
  );
  check('判定不可解释', r.kind === 'unexplainable');
  if (r.kind === 'unexplainable') {
    check('最早死帧为第 4 帧', r.firstDeadFrame === 3, r.firstDeadFrame);
    check('附带该帧灯态', r.frameLights === '011', r.frameLights);
  }
}

if (failures > 0) {
  console.error(`冒烟失败：${failures} 项断言未通过`);
  process.exit(1);
}
console.log('冒烟全部通过');
