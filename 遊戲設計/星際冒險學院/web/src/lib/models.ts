export type Classroom = {
  id: string
  name: string
  grade: string
  joinCode: string
  studentCount: number
  completion: number
}

export type QuestionBank = {
  id: string
  name: string
  subject: string
  questionCount: number
  updatedAt: string
}

export const demoClassrooms: Classroom[] = [
  { id: 'demo-a', name: '三年甲班', grade: '三年級', joinCode: 'STAR-3A', studentCount: 26, completion: 73 },
  { id: 'demo-b', name: '三年乙班', grade: '三年級', joinCode: 'STAR-3B', studentCount: 24, completion: 58 },
]

export const demoQuestionBanks: QuestionBank[] = [
  { id: 'bank-math', name: '數學隕石獸', subject: '數學', questionCount: 18, updatedAt: '今天' },
  { id: 'bank-chinese', name: '國語幽靈艦', subject: '國語', questionCount: 16, updatedAt: '昨天' },
  { id: 'bank-life', name: '生活探索站', subject: '生活', questionCount: 12, updatedAt: '7 月 30 日' },
]
