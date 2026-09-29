/**
 * 问题模型类型定义。
 *
 * 灯态用位串表示：每位 0/1，lights[k] 为该路灯（登记顺序 k=0..M-1）。
 */

/** 一个运行状态（如 “I段供电”）及其各路灯的常态值。 */
export interface StateDef {
  id: string;
  name: string;
  /** 长度等于灯路数 M，每位为 '0' 或 '1'。 */
  lights: string;
}

/** 有向状态切换边：允许从 from 切换到 to。 */
export interface Transition {
  from: string;
  to: string;
}

/** 一帧观测，灯态串长度为 M。 */
export interface Frame {
  lights: string;
}

/** 完整复核题面。 */
export interface ReviewInput {
  states: StateDef[];
  transitions: Transition[];
  frames: Frame[];
}

/** 一条灯路卡滞故障窗（帧下标，闭区间）。 */
export interface FaultWindow {
  /** 卡住的灯路登记序号（0 基）。 */
  lamp: number;
  /** 起帧（0 基，含）。 */
  start: number;
  /** 止帧（0 基，含），end - start + 1 >= 2。 */
  end: number;
  /** 窗内该路灯被卡住的观测值（'0' | '1'）。 */
  value: string;
}

/** 逐帧证据：状态名、转移类型、逐灯吻合情况。 */
export interface FrameEvidence {
  frame: number;
  stateId: string;
  stateName: string;
  transitionFromPrev: 'start' | 'stay' | 'switch';
  prevStateId: string | null;
  prevStateName: string | null;
  /** 每位：'match' 精确吻合 | 'fault' 落在故障窗内被豁免。 */
  lamps: Array<{ observed: string; expected: string; status: 'match' | 'fault' }>;
}

export type ReviewOutcome =
  | {
      kind: 'ok';
      fault: FaultWindow | null;
      /** 最优解的全程状态 id，长度等于帧数。 */
      stateSequence: string[];
      evidence: FrameEvidence[];
      /** 参与枚举的全部假设（用于说明择优过程，可空展示）。 */
      considered: number;
    }
  | {
      kind: 'unexplainable';
      /** 按帧顺序最早“对全部假设都无可达状态”的观测帧（0 基）。 */
      firstDeadFrame: number;
      /** 该帧灯态原文。 */
      frameLights: string;
    };

export interface ValidationIssue {
  message: string;
}
