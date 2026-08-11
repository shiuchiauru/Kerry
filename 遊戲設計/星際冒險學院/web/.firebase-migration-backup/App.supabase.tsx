import { useEffect, useMemo, useState } from 'react'
import { demoClassrooms, demoQuestionBanks, type Classroom, type QuestionBank } from './lib/models'
import { isSupabaseConfigured, signInTeacher, supabase } from './lib/supabase'

type Tab = 'overview' | 'classes' | 'banks'

const stars = ['✦', '·', '✧', '·', '✦', '·', '✧']

export default function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const [teacherName, setTeacherName] = useState('巧茹老師')
  const [classrooms, setClassrooms] = useState<Classroom[]>(demoClassrooms)
  const [banks, setBanks] = useState<QuestionBank[]>(demoQuestionBanks)
  const [message, setMessage] = useState('目前為示範模式；連接資料庫後會自動載入您的專屬資料。')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => {
      const name = data.user?.user_metadata.full_name as string | undefined
      if (name) setTeacherName(`${name} 老師`)
      if (data.user) setMessage('已連接帳號。接下來將載入您擁有的班級與題庫。')
    })
  }, [])

  const studentTotal = useMemo(
    () => classrooms.reduce((total, classroom) => total + classroom.studentCount, 0),
    [classrooms],
  )
  const averageCompletion = useMemo(
    () => Math.round(classrooms.reduce((total, classroom) => total + classroom.completion, 0) / classrooms.length),
    [classrooms],
  )

  async function handleGoogleLogin() {
    setError('')
    try {
      await signInTeacher()
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '無法啟動登入。')
    }
  }

  function addClassroom() {
    const number = classrooms.length + 1
    const classroom: Classroom = {
      id: crypto.randomUUID(),
      name: `新班級 ${number}`,
      grade: '未設定年級',
      joinCode: `STAR-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      studentCount: 0,
      completion: 0,
    }
    setClassrooms((items) => [...items, classroom])
    setMessage(`已新增「${classroom.name}」。正式模式會立刻寫入您的資料庫。`)
  }

  function addQuestionBank() {
    const bank: QuestionBank = {
      id: crypto.randomUUID(),
      name: `新題庫 ${banks.length + 1}`,
      subject: '未分類',
      questionCount: 0,
      updatedAt: '剛剛',
    }
    setBanks((items) => [...items, bank])
    setMessage(`已建立「${bank.name}」。可在下一步加入題目或匯入 CSV。`)
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#17143d] text-slate-100">
      <div className="pointer-events-none fixed inset-0 opacity-70" aria-hidden="true">
        <div className="absolute left-[8%] top-20 text-cyan-200">{stars[0]}</div>
        <div className="absolute right-[14%] top-36 text-yellow-200">{stars[2]}</div>
        <div className="absolute bottom-28 left-[18%] text-pink-200">{stars[4]}</div>
      </div>

      <section className="relative mx-auto flex min-h-screen max-w-7xl flex-col p-4 sm:p-6 lg:p-8">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/15 bg-white/10 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-cyan-200">STAR ACADEMY</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">🚀 星際冒險學院・教師管理中心</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-violet-300/20 px-3 py-1.5 text-sm font-bold text-violet-100">{teacherName}</span>
            {isSupabaseConfigured ? (
              <button className="action-button bg-cyan-300 text-slate-950" onClick={handleGoogleLogin}>Google 登入</button>
            ) : (
              <span className="rounded-full border border-amber-200/30 bg-amber-100/10 px-3 py-1.5 text-xs font-bold text-amber-100">示範模式</span>
            )}
          </div>
        </header>

        <p className="mb-6 rounded-2xl border border-cyan-200/20 bg-cyan-200/10 px-4 py-3 text-sm text-cyan-50" role="status">{message}</p>
        {error && <p className="mb-6 rounded-2xl bg-rose-500/20 px-4 py-3 text-sm font-bold text-rose-100">{error}</p>}

        <nav className="mb-6 flex gap-2 overflow-x-auto" aria-label="教師管理選單">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>總覽</TabButton>
          <TabButton active={tab === 'classes'} onClick={() => setTab('classes')}>班級與學生</TabButton>
          <TabButton active={tab === 'banks'} onClick={() => setTab('banks')}>題庫與關卡</TabButton>
        </nav>

        {tab === 'overview' && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="管理班級" value={`${classrooms.length} 班`} icon="🏫" note="每班資料各自保存" />
              <Metric label="學生人數" value={`${studentTotal} 人`} icon="👩‍🚀" note="使用班級加入碼登入" />
              <Metric label="完成進度" value={`${averageCompletion}%`} icon="📈" note="以學習進步為主" />
              <Metric label="可用題庫" value={`${banks.length} 組`} icon="👾" note="可指定不同 Boss" />
            </section>
            <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <article className="panel">
                <div className="flex items-center justify-between gap-4"><h2>班級任務雷達</h2><button className="text-button" onClick={() => setTab('classes')}>查看班級</button></div>
                <div className="mt-5 space-y-4">
                  {classrooms.slice(0, 3).map((classroom) => <ProgressRow key={classroom.id} classroom={classroom} />)}
                </div>
              </article>
              <article className="panel">
                <h2>下一步設定</h2>
                <ol className="mt-4 space-y-3 text-sm leading-6 text-violet-100">
                  <li><b className="text-yellow-200">1．</b> 建立班級並發給學生加入碼。</li>
                  <li><b className="text-yellow-200">2．</b> 匯入題目，指定對應的 Boss 關卡。</li>
                  <li><b className="text-yellow-200">3．</b> 依答題與錯題紀錄調整教學。</li>
                </ol>
              </article>
            </section>
          </>
        )}

        {tab === 'classes' && <ClassroomPanel classrooms={classrooms} onAdd={addClassroom} />}
        {tab === 'banks' && <BankPanel banks={banks} onAdd={addQuestionBank} />}
      </section>
    </main>
  )
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button className={`tab-button ${active ? 'tab-button-active' : ''}`} onClick={onClick}>{children}</button>
}

function Metric({ label, value, icon, note }: { label: string; value: string; icon: string; note: string }) {
  return <article className="panel min-h-40"><span className="text-3xl">{icon}</span><p className="mt-3 text-sm font-bold text-violet-200">{label}</p><p className="mt-1 text-3xl font-black text-white">{value}</p><p className="mt-2 text-xs text-slate-300">{note}</p></article>
}

function ProgressRow({ classroom }: { classroom: Classroom }) {
  return <div><div className="mb-2 flex justify-between gap-3 text-sm"><span className="font-bold">{classroom.name}・{classroom.studentCount} 人</span><span className="text-cyan-200">{classroom.completion}%</span></div><div className="h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${classroom.completion}%` }} /></div></div>
}

function ClassroomPanel({ classrooms, onAdd }: { classrooms: Classroom[]; onAdd: () => void }) {
  return <section className="panel"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2>班級與學生</h2><p className="mt-1 text-sm text-slate-300">每個班級有獨立的學生名單、加入碼與學習紀錄。</p></div><button className="action-button bg-yellow-300 text-slate-950" onClick={onAdd}>＋ 新增班級</button></div><div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{classrooms.map((classroom) => <article className="rounded-2xl border border-white/15 bg-slate-950/20 p-5" key={classroom.id}><p className="text-lg font-black">🏫 {classroom.name}</p><p className="mt-1 text-sm text-violet-200">{classroom.grade}・{classroom.studentCount} 位學生</p><div className="mt-4 rounded-xl bg-white/10 p-3 text-sm"><span className="text-slate-300">學生加入碼</span><b className="ml-3 tracking-wider text-cyan-200">{classroom.joinCode}</b></div><ProgressRow classroom={classroom} /></article>)}</div></section>
}

function BankPanel({ banks, onAdd }: { banks: QuestionBank[]; onAdd: () => void }) {
  return <section className="panel"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2>題庫與 Boss 關卡</h2><p className="mt-1 text-sm text-slate-300">題庫屬於建立它的老師；可重複指定給不同班級。</p></div><button className="action-button bg-pink-300 text-slate-950" onClick={onAdd}>＋ 新增題庫</button></div><div className="mt-6 space-y-3">{banks.map((bank) => <article className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-slate-950/20 p-4 sm:flex-row sm:items-center sm:justify-between" key={bank.id}><div><p className="font-black">👾 {bank.name}</p><p className="mt-1 text-sm text-violet-200">{bank.subject}・{bank.questionCount} 題・更新於 {bank.updatedAt}</p></div><button className="text-button">管理題目</button></article>)}</div></section>
}
