import { useEffect, useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import type { Classroom, QuestionBank } from '../lib/models'
import {
  createClassroom,
  createQuestionBank,
  isFirebaseConfigured,
  observeTeacher,
  observeTeacherData,
  signInTeacher,
  signOutTeacher,
} from '../lib/firebase'

type View = 'lobby' | 'boss' | 'classroom'
type GameClassroom = Classroom & { roster?: { name?: string }[] }
type GameBank = QuestionBank & { icon?: string; questions?: unknown[] }

export default function GameApp() {
  const [teacher, setTeacher] = useState<User | null>(null)
  const [view, setView] = useState<View>('lobby')
  const [classes, setClasses] = useState<GameClassroom[]>([])
  const [banks, setBanks] = useState<GameBank[]>([])
  const [message, setMessage] = useState('請以 Google 教師帳號登入，載入您的星際學院資料。')
  const [busy, setBusy] = useState(false)

  useEffect(() => observeTeacher(setTeacher), [])
  useEffect(() => {
    if (!teacher) {
      setClasses([])
      setBanks([])
      return undefined
    }
    setMessage('Firebase 即時同步已啟動。')
    return observeTeacherData(
      teacher.uid,
      (items) => setClasses(items as GameClassroom[]),
      (items) => setBanks(items as GameBank[]),
      (error) => setMessage(`同步失敗：${error.message}`),
    )
  }, [teacher])

  const studentTotal = useMemo(
    () => classes.reduce((total, item) => total + (item.roster?.length ?? item.studentCount ?? 0), 0),
    [classes],
  )

  async function login() {
    setBusy(true)
    try { await signInTeacher() }
    catch (error) { setMessage(error instanceof Error ? `登入失敗：${error.message}` : 'Google 登入未完成。') }
    finally { setBusy(false) }
  }

  async function addClassroom() {
    if (!teacher) return login()
    setBusy(true)
    const number = classes.length + 1
    try {
      await createClassroom(teacher.uid, {
        name: `星際探索班 ${number}`,
        grade: '未設定年級',
        joinCode: `STAR-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        studentCount: 0,
        completion: 0,
      })
      setMessage('已新增班級，教師中心與前台會即時同步。')
    } finally { setBusy(false) }
  }

  async function addBoss() {
    if (!teacher) return login()
    setBusy(true)
    const number = banks.length + 1
    try {
      await createQuestionBank(teacher.uid, {
        name: `晶礦守衛 ${number}`,
        subject: '未設定科目',
        questionCount: 0,
        updatedAt: new Date().toLocaleDateString('zh-TW'),
        icon: '👾',
        questions: [],
      } as Omit<QuestionBank, 'id'>)
      setMessage('已新增 Boss 題庫，請到教師中心或後續題庫編輯功能加入題目。')
    } finally { setBusy(false) }
  }

  return (
    <main className={`game-shell game-${view}`}>
      <header className="game-header">
        <a className="brand" href="/">STAR ACADEMY<span>星際冒險學院</span></a>
        <nav aria-label="遊戲導覽">
          <button onClick={() => setView('lobby')} className={view === 'lobby' ? 'active' : ''}>學院大廳</button>
          <button onClick={() => setView('boss')} className={view === 'boss' ? 'active' : ''}>晶礦 Boss</button>
          <button onClick={() => setView('classroom')} className={view === 'classroom' ? 'active' : ''}>觀測教室</button>
        </nav>
        {teacher ? (
          <div className="account"><span>{teacher.displayName || teacher.email}</span><button onClick={() => void signOutTeacher()}>登出</button></div>
        ) : (
          <button className="login" onClick={() => void login()} disabled={busy || !isFirebaseConfigured}>{busy ? '登入中…' : 'Google 教師登入'}</button>
        )}
      </header>

      <section className="game-content">
        <p className="sync-status">{message}</p>
        {view === 'lobby' && <Lobby teacher={teacher} classes={classes} banks={banks} students={studentTotal} onLogin={login} />}
        {view === 'boss' && <BossArea banks={banks} teacher={teacher} onAdd={addBoss} busy={busy} />}
        {view === 'classroom' && <ClassroomArea classes={classes} teacher={teacher} onAdd={addClassroom} busy={busy} />}
      </section>
    </main>
  )
}

function Lobby({ teacher, classes, banks, students, onLogin }: { teacher: User | null; classes: GameClassroom[]; banks: GameBank[]; students: number; onLogin: () => Promise<void> }) {
  return <section className="hero-card">
    <p className="eyebrow">WELCOME, COMMANDER</p>
    <h1>星際冒險學院</h1>
    <p className="lead">在冒險中答題、在任務中成長。教師資料會安全同步到您的 Firebase 專案。</p>
    <div className="metrics"><Metric value={classes.length} label="個班級" /><Metric value={students} label="位學生" /><Metric value={banks.length} label="組 Boss 題庫" /></div>
    {!teacher && <button className="cta" onClick={() => void onLogin()}>以 Google 教師帳號啟動指揮中心</button>}
    {teacher && <p className="welcome">{teacher.displayName || teacher.email} 老師，您的星際資料已連線。</p>}
  </section>
}

function BossArea({ banks, teacher, onAdd, busy }: { banks: GameBank[]; teacher: User | null; onAdd: () => Promise<void>; busy: boolean }) {
  return <section className="panel"><div className="section-title"><div><p className="eyebrow">FLOATING CRYSTAL PLANET</p><h2>晶礦 Boss 戰鬥區</h2></div><button className="cta small" onClick={() => void onAdd()} disabled={busy}>{teacher ? '＋ 新增 Boss 題庫' : '登入後管理題庫'}</button></div>
    <div className="card-grid">{banks.map((bank) => <article className="boss-card" key={bank.id}><span>{bank.icon || '👾'}</span><h3>{bank.name}</h3><p>{bank.subject}</p><b>{bank.questions?.length ?? bank.questionCount ?? 0} 題</b></article>)}</div>
    {!banks.length && <p className="empty">尚未建立題庫。登入後按右上角按鈕建立第一隻 Boss。</p>}
  </section>
}

function ClassroomArea({ classes, teacher, onAdd, busy }: { classes: GameClassroom[]; teacher: User | null; onAdd: () => Promise<void>; busy: boolean }) {
  return <section className="panel"><div className="section-title"><div><p className="eyebrow">STARSHIP OBSERVATORY</p><h2>星艦觀測教室</h2></div><button className="cta small" onClick={() => void onAdd()} disabled={busy}>{teacher ? '＋ 新增班級' : '登入後管理班級'}</button></div>
    <div className="card-grid">{classes.map((item) => <article className="class-card" key={item.id}><span>🚀</span><h3>{item.name}</h3><p>{item.grade}</p><b>{item.roster?.length ?? item.studentCount ?? 0} 位學員</b><code>{item.joinCode}</code></article>)}</div>
    {!classes.length && <p className="empty">尚未建立班級。登入後按右上角按鈕建立第一個探索班。</p>}
  </section>
}

function Metric({ value, label }: { value: number; label: string }) { return <div><strong>{value}</strong><span>{label}</span></div> }
