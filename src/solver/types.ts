/**
 * 领域模型：
 * - 每个运行状态登记一组二值灯态（0/1），灯路按登记顺序编号。
 * - 有向边描述允许的状态切换；任意状态允许自环（保持原状态）。
 * - 观测为若干帧，每帧给出各路灯的二值读数。
 *
 * 故障模型（至多一次）：
 *  - 零故障：所有帧、所有灯路必须与所在状态精确吻合；
 *  - 单灯路卡滞：某一条灯路自某帧起连续至少两帧观测到同一固定值，
 *    卡滞窗内该灯路的期望值被忽略（窗内观测恒定）；
 *    故障窗外及其他灯路必须精确吻合。
 */

export type Bit = 0 | 1;

export interface StateDef {
  name: string;
  /** 长度等于灯路数；0/1 或 '' 表示尚未录入 */
  lamps: string[];
}

export interface EdgeDef {
  from: string;
  to: string;
}

export interface Frame {
  /** 长度等于灯路数；0/1 或 '' 表示尚未录入 */
  observed: string[];
}

export interface Scenario {
  states: StateDef[];
  /** 灯路按此顺序登记，编号即其在数组中的下标 */
  lampOrder: string[];
  edges: EdgeDef[];
  frames: Frame[];
}

export type ExplainStatus = 'normal' | 'fault' | 'unexplainable';

export interface FaultInfo {
  /** 卡滞灯路编号（灯路登记顺序下标） */
  lampIndex: number;
  lampName: string;
  /** 卡滞起帧（含），从 0 计 */
  startFrame: number;
  /** 卡滞窗结束帧（含） */
  endFrame: number;
  /** 卡滞的固定观测值 */
  stuckValue: Bit;
  /** 故障窗帧数（>=2） */
  windowLength: number;
}

/** 单个灯路在某帧的逐灯证据 */
export interface LampEvidence {
  lampIndex: number;
  lampName: string;
  observed: Bit;
  expected: Bit | null;
  match: boolean;
  ignored: boolean;
}

export interface FrameEvidence {
  frameIndex: number;
  stateName: string;
  /** 相对上一帧的转移：self=保持原状态，edge=沿登记边切换，null=首帧 */
  transition: 'self' | 'edge' | null;
  lamps: LampEvidence[];
  /** 该帧是否落在故障窗内 */
  inFaultWindow: boolean;
}

export interface UnexplainableInfo {
  /** 按帧顺序最早已无可达状态的观测位置（从 0 计） */
  frameIndex: number;
  /** 该帧灯态（已录入的 0/1） */
  observed: (Bit | null)[];
}

export interface ExplainResult {
  status: ExplainStatus;
  /** 逐帧状态名（normal / fault 时存在） */
  path: string[];
  fault: FaultInfo | null;
  evidence: FrameEvidence[];
  unexplainable: UnexplainableInfo | null;
}

export interface ValidationError {
  message: string;
}
