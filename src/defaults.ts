import type { ReviewInput } from './solver/types';

let counter = 0;
export function uid(prefix = 's'): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/** 首次打开时的示例题面：一次 Ⅰ段 → 切换中 → Ⅱ段 的正常切换，可直接复核。 */
export function defaultDraft(): ReviewInput {
  return {
    states: [
      { id: uid('a'), name: 'Ⅰ段母线供电', lights: '100' },
      { id: uid('m'), name: '切换过程', lights: '110' },
      { id: uid('b'), name: 'Ⅱ段母线供电', lights: '010' },
      { id: uid('d'), name: '双母并列', lights: '111' },
    ],
    transitions: [
      { from: '', to: '' },
      { from: '', to: '' },
      { from: '', to: '' },
      { from: '', to: '' },
      { from: '', to: '' },
    ],
    frames: ['100', '100', '110', '010', '010', '010'].map((lights) => ({
      lights,
    })),
  };
}

/** 用当前状态列表把默认边连成语义合法的有向切换关系。 */
export function withDefaultEdges(draft: ReviewInput): ReviewInput {
  const [a, m, b, d] = draft.states.map((s) => s.id);
  return {
    ...draft,
    transitions: [
      { from: a, to: m },
      { from: m, to: b },
      { from: b, to: m },
      { from: m, to: a },
      { from: a, to: d },
      { from: d, to: a },
    ],
  };
}
