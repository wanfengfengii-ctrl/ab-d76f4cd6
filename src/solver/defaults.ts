import type { Scenario } from './types';

/** 首次进入页面时载入的示例草稿 */
export function createDefaultScenario(): Scenario {
  return {
    lampOrder: ['控制电源', '合闸位置', '储能就绪'],
    states: [
      { name: '停运', lamps: ['0', '0', '0'] },
      { name: '储能', lamps: ['1', '0', '1'] },
      { name: '运行', lamps: ['1', '1', '1'] },
      { name: '检修', lamps: ['0', '0', '1'] },
    ],
    edges: [
      { from: '停运', to: '储能' },
      { from: '储能', to: '运行' },
      { from: '运行', to: '停运' },
      { from: '停运', to: '检修' },
      { from: '检修', to: '停运' },
    ],
    frames: [
      { observed: ['1', '0', '1'] }, // 储能
      { observed: ['1', '0', '1'] }, // 储能（保持）
      { observed: ['1', '1', '1'] }, // 储能→运行
      { observed: ['1', '1', '1'] }, // 运行（保持）
      { observed: ['0', '0', '0'] }, // 运行→停运
      { observed: ['0', '0', '1'] }, // 停运→检修
    ],
  };
}

export function emptyScenario(): Scenario {
  return {
    lampOrder: ['L1', 'L2', 'L3'],
    states: [
      { name: 'S1', lamps: ['0', '0', '0'] },
      { name: 'S2', lamps: ['0', '0', '0'] },
      { name: 'S3', lamps: ['0', '0', '0'] },
      { name: 'S4', lamps: ['0', '0', '0'] },
    ],
    edges: [],
    frames: Array.from({ length: 6 }, () => ({
      observed: ['0', '0', '0'],
    })),
  };
}
