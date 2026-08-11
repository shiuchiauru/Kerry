import { useEffect, useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import { demoClassrooms, demoQuestionBanks, type Classroom, type QuestionBank } from './lib/models'
import {
  isFirebaseConfigured,
  observeTeacher,
  observeTeacherData,
  signInTeacher,
  signOutTeacher,
} from './lib/firebase'

type Tab = 'overview' | 'classes' | 'banks'

const stars = ['✦', '✧', '✦', '✧', '✦', '✧', '✦']

export default function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const [teacher, setTeacher] = useState<User | null>(null)
  const [classrooms, setClassrooms] = useState<Classroom[]>(demoClassrooms)
  const [banks, setBanks] = useState<QuestionBank[]>(demoQuestionBanks)
  const [message, setMessage] = useState('請使用 Google 登入。登入後，班級與題庫將儲存在你的 Firebase 專屬空間。')
  const [error, setError] = useState('')

  useEffect(() => observeTeacher((user) => {
    setTeacher(user)
    if (!user) {
      setClassrooms(demoClassrooms)
      setBanks(demoQuestionBanks)
      setMessage('請使用 Google 登入。登入後，班級與題庫將儲存在你的 Firebase 專屬空間。')
    }
  }), [])

  useEffect(() => {
    if (!teacher) return undefined
    setMessage(`歡迎回來，${teacher.displayName ?? '星際教師'}。正在同步 Firebase 資料庫……`)
    return observeTeacherData(
      teacher.uid,
      (items) => {
        setClassrooms(items)
        setMessage('Firebase 資料庫已同步。只有你可以管理自己的班級資料。')
      },
      setBanks,
      (firebaseError) => setError(`資料庫同步失敗：${firebaseError.message}`),
    )
  }, [teacher])

  const studentTotal = useMemo(
    () => classrooms.reduce((total, classroom) => total + classroom.studentCount, 0),
    [classrooms],
  )
  const averageCompletion = useMemo(
    () => classrooms.length
      ? Math.round(classrooms.reduce((total, classroom) => total + classroom.completion, 0) / classrooms.length)
      : 0,
    [classrooms],
  )

  async function handleGoogleLogin() {
    setError('')
    try {
      await signInTeacher()
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Google 登入失敗，請再試一次。')
    }
  }

  async function handleSignOut() {
    setError('')
    try {
      await signOutTeacher()
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : '登出失敗，請再試一次。')
    }
  }

  const teacherName = teacher?.displayName ? `${teacher.displayName} 老師` : '訪客教師'

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
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">星際冒險學院｜教師指揮中心</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a className="action-button bg-violet-300 text-slate-950" href="/game.html">開啟遊戲前台</a>
            <span className="rounded-full bg-violet-300/20 px-3 py-1.5 text-sm font-bold text-violet-100">{teacherName}</span>
            {teacher ? (
              <button className="action-button bg-white/90 text-slate-950" onClick={handleSignOut}>登出</button>
            ) : isFirebaseConfigured ? (
              <button className="action-button bg-cyan-300 text-slate-950" onClick={handleGoogleLogin}>使用 Google 登入</button>
            ) : (
              <span className="rounded-full border border-amber-200/30 bg-amber-100/10 px-3 py-1.5 text-xs font-bold text-amber-100">尚未設定 Firebase</span>
            )}
          </div>
        </header>

        <p className="mb-6 rounded-2xl border border-cyan-200/20 bg-cyan-200/10 px-4 py-3 text-sm text-cyan-50" role="status">{message}</p>
        {error && <p className="mb-6 rounded-2xl bg-rose-500/20 px-4 py-3 text-sm font-bold text-rose-100">{error}</p>}

        <nav className="mb-6 flex gap-2 overflow-x-auto" aria-label="教師後台分頁">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>總覽</TabButton>
          <TabButton active={tab === 'classes'} onClick={() => setTab('classes')}>班級管理</TabButton>
          <TabButton active={tab === 'banks'} onClick={() => setTab('banks')}>題庫與 Boss</TabButton>
        </nav>

        {tab === 'overview' && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="管理班級" value={`${classrooms.length} 班`} icon="🛰️" note="登入後可跨裝置同步" />
              <Metric label="學生人數" value={`${studentTotal} 人`} icon="👩‍🚀" note="班級資料由教師管理" />
              <Metric label="平均完成率" value={`${averageCompletion}%`} icon="📈" note="冒險任務學習進度" />
              <Metric label="可用題庫" value={`${banks.length} 組`} icon="📚" note="可指派給不同 Boss" />
            </section>
            <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <article className="panel">
                <div className="flex items-center justify-between gap-4"><h2>班級學習進度</h2><button className="text-button" onClick={() => setTab('classes')}>前往班級</button></div>
                <div className="mt-5 space-y-4">
                  {classrooms.slice(0, 3).map((classroom) => <ProgressRow key={classroom.id} classroom={classroom} />)}
                  {!classrooms.length && <p className="text-sm text-slate-300">尚未建立班級，請到班級管理新增。</p>}
                </div>
              </article>
              <article className="panel">
                <h2>Firebase 連線狀態</h2>
                <ol className="mt-4 space-y-3 text-sm leading-6 text-violet-100">
                  <li><b className="text-yellow-200">1．</b> Google 登入會建立教師專屬帳號。</li>
                  <li><b className="text-yellow-200">2．</b> Firestore 規則限制教師只能讀寫自己的資料。</li>
                  <li><b className="text-yellow-200">3．</b> 班級與題庫會即時同步到所有裝置。</li>
                </ol>
              </article>
            </section>
          </>
        )}

        {tab === 'classes' && <ClassroomPanel classrooms={classrooms} />}
        {tab === 'banks' && <BankPanel banks={banks} />}
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
  return <div><div className="mb-2 flex justify-between gap-3 text-sm"><span className="font-bold">{classroom.name}｜{classroom.studentCount} 位學生</span><span className="text-cyan-200">{classroom.completion}%</span></div><div className="h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${classroom.completion}%` }} /></div></div>
}

function ClassroomPanel({ classrooms }: { classrooms: Classroom[] }) {
  return <section className="panel"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2>班級管理</h2><p className="mt-1 text-sm text-slate-300">每個班級都有專屬的學生連結，把它傳給學生就能直接進入該班的遊戲。</p></div><a className="action-button bg-yellow-300 text-slate-950" href="/game.html">在遊戲指揮中心編輯</a></div><div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{classrooms.map((classroom) => <article className="rounded-2xl border border-white/15 bg-slate-950/20 p-5" key={classroom.id}><p className="text-lg font-black">🛰️ {classroom.name}</p><p className="mt-1 text-sm text-violet-200">{classroom.grade}｜{classroom.studentCount} 位學生</p><StudentLink joinCode={classroom.joinCode} /><ProgressRow classroom={classroom} /></article>)}</div></section>
}

// navigator.clipboard 只存在於 HTTPS 或 localhost。老師是用區網 IP + http 開的，
// 那裡整個 API 都是 undefined，所以一定要有 execCommand 這條退路。
async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 權限被擋時往下走備援做法
    }
  }

  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.top = '0'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  field.setSelectionRange(0, text.length)

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  document.body.removeChild(field)
  return copied
}

function StudentLink({ joinCode }: { joinCode: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  // 學生開這個網址就會載入這一班，不必登入、不必輸入代碼。
  const link = `${window.location.origin}/game.html?class=${joinCode}`

  async function copy() {
    setStatus(await copyToClipboard(link) ? 'copied' : 'failed')
    setTimeout(() => setStatus('idle'), 3000)
  }

  return (
    <div className="mt-4 rounded-xl bg-white/10 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-300">班級代碼</span>
        <b className="tracking-wider text-cyan-200">{joinCode}</b>
      </div>
      {/* select-all 讓老師點一下就整條選起來，複製失敗時還能手動複製。 */}
      <p className="mt-3 select-all break-all text-xs leading-5 text-slate-300">{link}</p>
      <button className="text-button mt-2" onClick={() => void copy()}>
        {status === 'copied' ? '已複製 ✓' : status === 'failed' ? '複製失敗，請點上方網址手動複製' : '複製學生連結'}
      </button>
    </div>
  )
}

// 題庫的實際編輯在遊戲的「👽 Boss 題目」分頁。帶 ?tab=setBoss 過去，
// 已登入的話會直接落在那一頁，不用再按一次教師入口。
const BOSS_EDITOR = '/game.html?tab=setBoss'

function BankPanel({ banks }: { banks: QuestionBank[] }) {
  return <section className="panel"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2>題庫與 Boss 關卡</h2><p className="mt-1 text-sm text-slate-300">題庫資料會依登入教師分開儲存，其他老師無法讀取。編輯題目請到遊戲的 Boss 題目頁。</p></div><a className="action-button bg-pink-300 text-slate-950" href={BOSS_EDITOR}>在遊戲指揮中心編輯</a></div><div className="mt-6 space-y-3">{banks.map((bank) => <article className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-slate-950/20 p-4 sm:flex-row sm:items-center sm:justify-between" key={bank.id}><div><p className="font-black">📚 {bank.name}</p><p className="mt-1 text-sm text-violet-200">{bank.subject}｜{bank.questionCount} 題｜更新於 {formatUpdatedAt(bank.updatedAt)}</p></div><a className="text-button" href={BOSS_EDITOR}>編輯題庫</a></article>)}</div></section>
}

// 雲端存的是 ISO 時間字串，直接顯示會是 2026-08-10T16:50:10.570Z 這種不好讀的格式。
function formatUpdatedAt(value: string) {
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return value
  return time.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
