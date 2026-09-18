export type Role = "admin" | "learner";

export type QuestionType = "single" | "multi" | "judge";

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  xp: number;
};

export type MindNode = {
  id: string;
  label: string;
  children?: MindNode[];
};

export type GeneratedQuestion = {
  type: QuestionType;
  stem: string;
  options: string[];
  answer: number[];
  explanation: string;
};

export type GeneratedCase = {
  title: string;
  scene: string;
  analysis: string;
};

export type GeneratedChapter = {
  title: string;
  summary: string;
  notesMd: string;
  mindmap: MindNode;
  /** 业务知识库教材标注的学习优先级：P1（最重点/最推荐）～P3，可空 */
  priority?: string;
  cases: GeneratedCase[];
  questions: GeneratedQuestion[];
};

export type GeneratedCourse = {
  title: string;
  description: string;
  coverEmoji: string;
  chapters: GeneratedChapter[];
};
