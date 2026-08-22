// 实验臂（arms）配置：三组的系统提示词、是否受范围守卫约束、是否为 AI 对话。

export type ArmCode = "socratic" | "free" | "solo";

export interface ArmConfig {
  code: ArmCode;
  name: string;
  description: string;
  /** 是否调用 DeepSeek 进行对话（solo 组为 false） */
  isAiChat: boolean;
  /** 是否受"范围守卫"约束（仅 AI 对话组受约束） */
  scopeGuarded: boolean;
  /** 系统提示词（solo 组无意义，为空） */
  systemPrompt: string;
  /** 默认温度 */
  temperature: number;
}

export const ARMS: Record<ArmCode, ArmConfig> = {
  socratic: {
    code: "socratic",
    name: "苏格拉底式引导",
    description:
      "AI 只通过提问引导学生自己思考，不直接给答案；中途引导反思，结束时生成总结。",
    isAiChat: true,
    scopeGuarded: true,
    temperature: 0.6,
    systemPrompt: `你是「引路者」，一位专门帮助大学生思考并和平、合理地解决宿舍矛盾及人际/情绪议题的引导型对话助手。请严格遵守以下规则：

1. 永远不要直接给出结论、建议或解决方案。你的职责是提问，不是给答案。
2. 只通过苏格拉底式提问，引导学生自己梳理问题、识别情绪、换位思考、探索可行的解决路径。
3. 当学生表达卡住、情绪强烈或给出模糊说法时，先共情，再引导他做一次简短的「反思」，例如："刚才这件事里，你觉得自己在哪一步可以换个做法？"或"如果对方是你，你会希望被怎样对待？"
4. 保持温和、共情、不评判的语气，使用简体中文，一次不要抛出超过两个问题。
5. 在对话接近解决问题、学生思路已清晰时，生成一段「总结」：归纳他此刻的思路、关键洞察，以及 1–2 个可以马上尝试的下一步。总结前可先说"我们来回顾一下"。`,
  },
  free: {
    code: "free",
    name: "自由问答",
    description: "AI 像普通助手一样，学生问什么就答什么，给出具体可操作的建议。",
    isAiChat: true,
    scopeGuarded: true,
    temperature: 0.7,
    systemPrompt: `你是「帮帮」，一个乐于助人的对话助手，专门帮助大学生解决宿舍矛盾及人际/情绪议题。学生问什么你就回答什么，给出具体、可操作、符合现实的建议和解释。使用简体中文，语气自然、友好、务实。`,
  },
  solo: {
    code: "solo",
    name: "自主思考（无 AI）",
    description:
      "不调用任何 AI。学生自行整理思路，通过上传文档或直接在界面内书写来完成。",
    isAiChat: false,
    scopeGuarded: false,
    temperature: 0,
    systemPrompt: "",
  },
};

export const ARM_LIST: ArmConfig[] = [
  ARMS.socratic,
  ARMS.free,
  ARMS.solo,
];

// 允许议题白名单：范围守卫据此判定"超出测试范围"。
export const SCOPE_TOPICS: string[] = [
  "宿舍矛盾（室友作息、卫生、噪音、物品使用、隐私、空调暖气等）",
  "大学生人际冲突（同学、朋友、师生、恋人、家人之间的矛盾）",
  "情绪调节（焦虑、抑郁、愤怒、孤独、压力、委屈等情绪困扰）",
  "沟通技巧（表达、倾听、协商、拒绝、道歉、设立边界）",
  "学习/学业压力（考试、拖延、竞争、毕业设计、升学就业）",
  "个人成长与心理健康相关的求助与自我反思",
];

export function getArm(code: string): ArmConfig | null {
  return (ARMS as Record<string, ArmConfig>)[code] ?? null;
}
