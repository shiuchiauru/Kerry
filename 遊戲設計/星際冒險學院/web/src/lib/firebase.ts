import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { ReCaptchaV3Provider, initializeAppCheck } from 'firebase/app-check'
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import type { Classroom, QuestionBank } from './models'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey
    && firebaseConfig.authDomain
    && firebaseConfig.projectId
    && firebaseConfig.appId
    && !firebaseConfig.projectId.includes('your-project'),
)

const app: FirebaseApp | null = isFirebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null

// App Check：網站公開後，任何人開啟頁面都能用掉 Gemini 的免費額度，
// 這裡先證明「請求來自我們自己的網站」，Firebase 才放行。
// 必須在其他 Firebase 服務被使用前初始化，所以放在這裡。
// 沒設定 VITE_RECAPTCHA_SITE_KEY 時直接略過，本機開發照常可用。
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY

if (app && recaptchaSiteKey) {
  if (import.meta.env.DEV) {
    // 本機開發沒有正式網域，要用 debug token，否則請求會被 App Check 擋掉。
    // 首次啟動時 console 會印出一組 token，貼到 Firebase Console 的偵錯權杖清單。
    ;(self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  } catch (error) {
    console.error('App Check 初始化失敗', error)
  }
}

export const firebaseApp = app
export const auth = app ? getAuth(app) : null
export const database = app ? getFirestore(app) : null

function requireFirebase() {
  if (!auth || !database) throw new Error('Firebase 尚未完成設定。')
  return { auth, database }
}

export async function signInTeacher() {
  const { auth: firebaseAuth } = requireFirebase()
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const result = await signInWithPopup(firebaseAuth, provider)
  await saveTeacherProfile(result.user)
}

export async function signOutTeacher() {
  const { auth: firebaseAuth } = requireFirebase()
  await signOut(firebaseAuth)
}

export function observeTeacher(onChange: (user: User | null) => void) {
  if (!auth) return () => undefined
  // 學生以匿名身分登入回報成績，同一個瀏覽器開過學生連結後，
  // 這裡會收到那個匿名帳號。它不是老師，當成未登入處理。
  return onAuthStateChanged(auth, (user) => onChange(user && !user.isAnonymous ? user : null))
}

async function saveTeacherProfile(user: User) {
  const { database: firestore } = requireFirebase()
  await setDoc(doc(firestore, 'teachers', user.uid), {
    displayName: user.displayName ?? '星際教師',
    email: user.email ?? '',
    photoURL: user.photoURL ?? '',
    updatedAt: new Date().toISOString(),
  }, { merge: true })
}

export function observeTeacherData(
  teacherId: string,
  onClassrooms: (items: Classroom[]) => void,
  onBanks: (items: QuestionBank[]) => void,
  onError: (error: Error) => void,
) {
  const { database: firestore } = requireFirebase()
  const classroomsQuery = query(collection(firestore, 'classrooms'), where('teacherId', '==', teacherId))
  const banksQuery = query(collection(firestore, 'questionBanks'), where('teacherId', '==', teacherId))

  const stopClassrooms = onSnapshot(classroomsQuery, (snapshot) => {
    onClassrooms(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Classroom))
  }, onError)
  const stopBanks = onSnapshot(banksQuery, (snapshot) => {
    onBanks(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as QuestionBank))
  }, onError)

  return () => {
    stopClassrooms()
    stopBanks()
  }
}

export async function createClassroom(teacherId: string, classroom: Omit<Classroom, 'id'>) {
  const { database: firestore } = requireFirebase()
  await addDoc(collection(firestore, 'classrooms'), { ...classroom, teacherId, createdAt: new Date().toISOString() })
}

export async function createQuestionBank(teacherId: string, bank: Omit<QuestionBank, 'id'>) {
  const { database: firestore } = requireFirebase()
  await addDoc(collection(firestore, 'questionBanks'), { ...bank, teacherId, createdAt: new Date().toISOString() })
}
