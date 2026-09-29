import type { Scenario, ValidationError } from './types';

const BIT = new Set(['0', '1']);

/** 录入完整性与范围校验；存在错误时不允许复核 */
export function validateScenario(scenario: Scenario): ValidationError[] {
  const errors: ValidationError[] = [];
  const push = (message: string) => errors.push({ message });

  const ns = scenario.states.length;
  const nl = scenario.lampOrder.length;
  const nf = scenario.frames.length;

  if (ns < 4 || ns > 8) push(`运行状态数量需为 4~8 个，当前 ${ns} 个。`);
  if (nl < 3 || nl > 8) push(`灯路数量需为 3~8 路，当前 ${nl} 路。`);
  if (nf < 6 || nf > 20) push(`观测帧数需为 6~20 帧，当前 ${nf} 帧。`);

  const stateNames = new Set<string>();
  scenario.states.forEach((s, i) => {
    const name = s.name.trim();
    if (!name) {
      push(`第 ${i + 1} 个运行状态缺少名称。`);
    } else if (stateNames.has(name)) {
      push(`运行状态名称重复：「${name}」。`);
    } else {
      stateNames.add(name);
    }
    if (s.lamps.length !== nl) {
      push(`状态「${name || i + 1}」的灯态数量与灯路数不一致。`);
    }
    s.lamps.forEach((v, k) => {
      if (!BIT.has(v)) {
        push(
          `状态「${name || i + 1}」的第 ${k + 1} 路灯态未录入（需为 0/1）。`,
        );
      }
    });
  });

  const lampNames = new Set<string>();
  scenario.lampOrder.forEach((raw, k) => {
    const name = raw.trim();
    if (!name) push(`第 ${k + 1} 路灯路缺少名称。`);
    else if (lampNames.has(name)) push(`灯路名称重复：「${name}」。`);
    else lampNames.add(name);
  });

  scenario.edges.forEach((e, i) => {
    if (!stateNames.has(e.from) || !stateNames.has(e.to)) {
      push(
        `第 ${i + 1} 条切换边引用了不存在的状态：${e.from || '?'} → ${e.to || '?'}。`,
      );
    }
  });

  scenario.frames.forEach((f, t) => {
    if (f.observed.length !== nl) {
      push(`第 ${t + 1} 帧观测的灯态数量与灯路数不一致。`);
    }
    f.observed.forEach((v, k) => {
      if (!BIT.has(v)) {
        push(`第 ${t + 1} 帧第 ${k + 1} 路观测未录入（需为 0/1）。`);
      }
    });
  });

  return errors;
}
