import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query, setDoc, where } from 'firebase/firestore'
import { auth, database, isFirebaseConfigured, signInTeacher, signOutTeacher } from '../lib/firebase'
import { installAI } from './ai'
import './login-overlay.css'

type GameUser = { uid: string; displayName: string; email: string; isAnonymous: boolean }
type GameData = { classrooms: Record<string, unknown>[]; banks: Record<string, unknown>[] }

declare global {
  interface Window {
    starAcademyFirebase?: {
      configured: boolean
      signIn: () => Promise<GameUser>
      signOut: () => Promise<void>
      observeAuth: (callback: (user: GameUser | null) => void) => () => void
      observeData: (teacherId: string, callback: (data: GameData) => void, onError: (error: Error) => void) => () => void
      saveClassroom: (teacherId: string, id: string | null, data: Record<string, unknown>) => Promise<string>
      saveBank: (teacherId: string, id: string | null, data: Record<string, unknown>) => Promise<string>
      deleteClassroom: (id: string) => Promise<void>
      deleteBank: (id: string) => Promise<void>
      savePublicClass: (teacherId: string, joinCode: string, data: Record<string, unknown>) => Promise<void>
      deletePublicClass: (joinCode: string) => Promise<void>
      loadPublicClass: (joinCode: string) => Promise<Record<string, unknown> | null>
      signInStudent: () => Promise<void>
      saveStudentProgress: (data: Record<string, unknown>) => Promise<void>
      observeClassProgress: (
        teacherId: string,
        callback: (rows: Record<string, unknown>[]) => void,
        onError: (error: Error) => void,
      ) => () => void
      saveTaskPhoto: (data: Record<string, unknown>) => Promise<void>
      observeTaskPhotos: (
        teacherId: string,
        callback: (rows: Record<string, unknown>[]) => void,
        onError: (error: Error) => void,
      ) => () => void
    }
  }
}

function asGameUser(user: User): GameUser {
  return {
    uid: user.uid,
    displayName: user.displayName || '星際老師',
    email: user.email || '',
    isAnonymous: user.isAnonymous,
  }
}

function requireDatabase() {
  if (!database) throw new Error('Firebase 尚未設定完成。')
  return database
}

function installBridge() {
  window.starAcademyFirebase = {
    configured: isFirebaseConfigured,
    async signIn() {
      if (!auth?.currentUser) await signInTeacher()
      if (!auth?.currentUser) throw new Error('Google 登入未完成。')
      return asGameUser(auth.currentUser)
    },
    signOut: signOutTeacher,
    observeAuth(callback) {
      if (!auth) { callback(null); return () => undefined }
      return onAuthStateChanged(auth, (user) => callback(user ? asGameUser(user) : null))
    },
    observeData(teacherId, callback, onError) {
      const firestore = requireDatabase()
      let classrooms: Record<string, unknown>[] = []
      let banks: Record<string, unknown>[] = []
      // 班級與題庫是兩個獨立訂閱，先到的那個會帶著另一個的空陣列。
      // 兩邊都回來過才發佈，否則接收端會把「題庫是空的」當成真的沒有題庫。
      let hasClassrooms = false
      let hasBanks = false
      const publish = () => { if (hasClassrooms && hasBanks) callback({ classrooms, banks }) }
      const stopClassrooms = onSnapshot(query(collection(firestore, 'classrooms'), where('teacherId', '==', teacherId)), (snapshot) => {
        classrooms = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })); hasClassrooms = true; publish()
      }, onError)
      const stopBanks = onSnapshot(query(collection(firestore, 'questionBanks'), where('teacherId', '==', teacherId)), (snapshot) => {
        banks = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })); hasBanks = true; publish()
      }, onError)
      return () => { stopClassrooms(); stopBanks() }
    },
    async saveClassroom(teacherId, id, data) {
      const firestore = requireDatabase()
      const payload = { ...data, teacherId, updatedAt: new Date().toISOString() }
      if (id) { await setDoc(doc(firestore, 'classrooms', id), payload, { merge: true }); return id }
      return (await addDoc(collection(firestore, 'classrooms'), { ...payload, createdAt: new Date().toISOString() })).id
    },
    async saveBank(teacherId, id, data) {
      const firestore = requireDatabase()
      const payload = { ...data, teacherId, updatedAt: new Date().toISOString() }
      if (id) { await setDoc(doc(firestore, 'questionBanks', id), payload, { merge: true }); return id }
      return (await addDoc(collection(firestore, 'questionBanks'), { ...payload, createdAt: new Date().toISOString() })).id
    },
    async deleteClassroom(id) {
      await deleteDoc(doc(requireDatabase(), 'classrooms', id))
    },
    async deleteBank(id) {
      await deleteDoc(doc(requireDatabase(), 'questionBanks', id))
    },
    // 學生用班級代碼開啟遊戲時讀的公開副本，文件 id 就是班級代碼，學生端可直接取單一文件。
    // 內容只放學生玩得起來所需的東西，名冊一律去識別化（只有座號與學號）。
    async savePublicClass(teacherId, joinCode, data) {
      await setDoc(doc(requireDatabase(), 'publicClasses', joinCode), {
        ...data, teacherId, joinCode, updatedAt: new Date().toISOString(),
      })
    },
    async deletePublicClass(joinCode) {
      await deleteDoc(doc(requireDatabase(), 'publicClasses', joinCode))
    },
    async loadPublicClass(joinCode) {
      const snapshot = await getDoc(doc(requireDatabase(), 'publicClasses', joinCode))
      return snapshot.exists() ? snapshot.data() : null
    },
    // 學生不必有帳號，用匿名登入取得一個 uid 就能把自己的成績寫回去。
    async signInStudent() {
      if (!auth) throw new Error('Firebase 尚未設定完成。')
      if (auth.currentUser) return
      await signInAnonymously(auth)
    },
    // 文件 id 固定是「班級代碼_座號」，規則據此擋掉亂寫別班或別人的成績。
    async saveStudentProgress(data) {
      const { joinCode, sid } = data as { joinCode: string; sid: string }
      await setDoc(doc(requireDatabase(), 'studentProgress', `${joinCode}_${sid}`), {
        ...data, updatedAt: new Date().toISOString(),
      })
    },
    // 拍照打卡的照片。文件 id 是「班級代碼_座號_任務」，同一個任務重傳會覆蓋。
    // 照片內容可能有學生筆跡姓名，規則設成只有該班老師讀得到。
    async saveTaskPhoto(data) {
      const { joinCode, sid, taskId } = data as { joinCode: string; sid: string; taskId: string }
      await setDoc(doc(requireDatabase(), 'taskPhotos', `${joinCode}_${sid}_${taskId}`), {
        ...data, updatedAt: new Date().toISOString(),
      })
    },
    observeTaskPhotos(teacherId, callback, onError) {
      const photoQuery = query(collection(requireDatabase(), 'taskPhotos'), where('teacherId', '==', teacherId))
      return onSnapshot(photoQuery, (snapshot) => {
        callback(snapshot.docs.map((item) => item.data()))
      }, onError)
    },
    observeClassProgress(teacherId, callback, onError) {
      const progressQuery = query(collection(requireDatabase(), 'studentProgress'), where('teacherId', '==', teacherId))
      return onSnapshot(progressQuery, (snapshot) => {
        callback(snapshot.docs.map((item) => item.data()))
      }, onError)
    },
  }
}

const firebaseMethods = String.raw`
  _firebaseSignature(){ return JSON.stringify({ classes:this.state.classes, bosses:this.state.bosses, tasks:this.state.tasks, items:this.state.items }); }
  // 名冊只上傳座號、學號與學習進度，不上傳姓名（去識別化）。
  _deidentifyRoster(roster){
    return (roster || []).map(r => ({
      sid:r.sid || '', sno:r.sno || '', done:r.done || 0, score:r.score || 0, coins:r.coins || 0,
      bossId:r.bossId || '', rounds:r.rounds || 0, status:r.status || '— 未測驗',
      wrongNums:r.wrongNums || [], hist:r.hist || [], week:r.week || [0,0,0,0,0]
    }));
  }
  // 雲端回來的名冊沒有姓名，用座號當顯示名稱，畫面上各處才不會空白。
  _labelRoster(roster){
    return (roster || []).map(r => ({ ...r, name: r.sid ? r.sid + ' 號' : '學員' }));
  }
  // 班級代碼一旦發出去就是學生的入口，改名時必須沿用，不能跟著班級名稱重算。
  _newJoinCode(){
    let code = '';
    for (let i = 0; i < 4; i++) code += 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)];
    return 'STAR-' + code;
  }
  _queueFirebaseSync(){
    if (!this._firebaseUser || this._firebaseHydrating) return;
    if (this._firebaseSignature() === this._firebaseLastSignature) return;
    clearTimeout(this._firebaseSyncTimer);
    this._firebaseSyncTimer = setTimeout(() => this._persistFirebaseData(), 650);
  }
  // 清掉雲端的同名重複班級。本地狀態沒變，所以不能靠 _queueFirebaseSync 的簽章比對。
  _queueFirebaseCleanup(){
    if (!this._firebaseUser) return;
    clearTimeout(this._firebaseSyncTimer);
    this._firebaseSyncTimer = setTimeout(() => this._persistFirebaseData(), 900);
  }
  async _persistFirebaseData(){
    if (!this._firebaseUser || !window.starAcademyFirebase) return;
    const api = window.starAcademyFirebase, uid = this._firebaseUser.uid;
    const nextSignature = this._firebaseSignature();
    let publicCopyFailed = false;
    try {
      const activeBankIds = {}, bosses = this.state.bosses || [];
      for (const boss of bosses) {
        const known = this._firebaseBankIds && this._firebaseBankIds[boss.id];
        const id = await api.saveBank(uid, known || null, {
          name:boss.name || '未命名 Boss', subject:boss.subject || '未分類', icon:boss.icon || '👾',
          questions:boss.questions || [], questionCount:(boss.questions || []).length,
          updatedAt:new Date().toLocaleDateString('zh-TW')
        });
        activeBankIds[boss.id] = id;
        activeBankIds[id] = id;
      }

      const classIds = this._firebaseClassIds || {}, joinCodes = this._firebaseJoinCodes || {};
      const activeClassIds = {}, activeJoinCodes = {};
      // 學生端要玩得起來，公開副本得帶上題庫、任務與商店，不是只有名冊。
      const sharedPlayData = {
        bosses: bosses.map(b => ({ id:b.id, name:b.name, subject:b.subject, icon:b.icon, questions:b.questions || [] })),
        tasks: this.state.tasks || [],
        items: this.state.items || []
      };
      for (const name of Object.keys(this.state.classes || {})) {
        const roster = this._deidentifyRoster(this.state.classes[name]);
        const joinCode = joinCodes[name] || this._newJoinCode();
        const id = await api.saveClassroom(uid, classIds[name] || null, {
          name, grade:'未設定', joinCode, roster, studentCount:roster.length,
          completion: roster.length ? Math.round(roster.filter(r => r.rounds && r.score >= 100).length / roster.length * 100) : 0
        });
        activeClassIds[name] = id;
        activeJoinCodes[name] = joinCode;
        // 學生連結副本是附加功能，寫不進去也不能拖垮老師自己的資料存檔。
        try { await api.savePublicClass(uid, joinCode, { className:name, roster, ...sharedPlayData }); }
        catch (publicError) { console.error(publicError); publicCopyFailed = true; }
      }

      // 同名重複的舊班級文件先清掉，否則刪除班級時只會刪到其中一筆。
      const liveJoinCodes = new Set(Object.values(activeJoinCodes));
      for (const extra of (this._firebaseDuplicateClasses || [])) {
        await api.deleteClassroom(extra.id);
        if (extra.joinCode && !liveJoinCodes.has(extra.joinCode)) {
          try { await api.deletePublicClass(extra.joinCode); }
          catch (publicError) { console.error(publicError); publicCopyFailed = true; }
        }
      }
      this._firebaseDuplicateClasses = [];

      // 本地已經刪掉的班級與題庫，雲端也要跟著刪，否則下次登入又會冒出來。
      for (const name of Object.keys(classIds)) {
        if (activeClassIds[name]) continue;
        await api.deleteClassroom(classIds[name]);
        if (joinCodes[name]) {
          try { await api.deletePublicClass(joinCodes[name]); }
          catch (publicError) { console.error(publicError); publicCopyFailed = true; }
        }
      }
      const liveBankIds = new Set(Object.values(activeBankIds));
      for (const id of new Set(Object.values(this._firebaseBankIds || {}))) {
        if (!liveBankIds.has(id)) await api.deleteBank(id);
      }

      this._firebaseClassIds = activeClassIds;
      this._firebaseJoinCodes = activeJoinCodes;
      this._firebaseBankIds = activeBankIds;
      this._firebaseLastSignature = nextSignature;
      if (publicCopyFailed && !this._publicCopyWarned) {
        this._publicCopyWarned = true;
        this.showToast('你的資料已儲存，但學生連結副本更新失敗，請確認 Firestore 規則 ⚠️');
      }
    } catch (error) {
      console.error(error);
      this.showToast('Firebase 儲存失敗，請確認網路與 Firestore 規則 ⚠️');
      // 沒寫成功就重試，不然這次的修改只留在畫面上，重新整理就不見了。
      this._firebaseLastSignature = '';
      clearTimeout(this._firebaseSyncTimer);
      this._firebaseSyncTimer = setTimeout(() => this._persistFirebaseData(), 4000);
    }
  }
  _connectFirebase(user){
    if (!window.starAcademyFirebase || !user) return;
    this._firebaseUser = user;
    this._firebaseHydrated = false;
    if (this._firebaseDataStop) this._firebaseDataStop();
    this._firebaseDataStop = window.starAcademyFirebase.observeData(user.uid, data => {
      // 只有登入後的第一份快照會套用到畫面，之後改成單向：本地狀態寫進雲端，不再回頭覆蓋。
      // 原本每份快照都套用，但存一次要寫多筆文件、每筆都會觸發一份快照，
      // 其中「只寫到一半」的舊快照可能在寫入結束後才送達，
      // 就會把剛新增的班級或學生抹掉，還把目前選取的班級跳回別班。
      if (this._firebaseHydrated) return;
      this._firebaseHydrated = true;
      const remoteClasses = data.classrooms || [], remoteBanks = data.banks || [];
      const classIds = {}, joinCodes = {}, classes = {}, duplicates = [];
      // 雲端可能有同名的重複班級（早期改名的 bug 會留下），以最後更新的那筆為準，
      // 其餘記下來在下次存檔時刪掉。不這樣做的話，被蓋掉的那筆 id 就再也沒人記得，
      // 老師刪了班級也只會刪到其中一筆，另一筆下次登入又冒出來。
      [...remoteClasses]
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .forEach(item => {
          if (!item.name) return;
          if (classIds[item.name]) { duplicates.push({ id:item.id, joinCode:item.joinCode }); return; }
          classIds[item.name] = item.id;
          if (item.joinCode) joinCodes[item.name] = item.joinCode;
          classes[item.name] = this._labelRoster(Array.isArray(item.roster) ? item.roster : []);
        });
      const bankIds = {}, bosses = remoteBanks.map(item => {
        bankIds[item.id] = item.id;
        return { id:item.id, name:item.name || '未命名 Boss', subject:item.subject || '未分類', icon:item.icon || '👾', questions:Array.isArray(item.questions) ? item.questions : [] };
      });
      this._firebaseHydrating = true;
      this.setState(current => ({
        classes: remoteClasses.length ? classes : current.classes,
        bosses: remoteBanks.length ? bosses : current.bosses,
        klass: remoteClasses.length ? (classes[current.klass] ? current.klass : Object.keys(classes)[0]) : current.klass,
        klassRename: remoteClasses.length ? (classes[current.klass] ? current.klass : Object.keys(classes)[0]) : current.klassRename,
        editBoss: remoteBanks.length ? (bosses.some(b => b.id === current.editBoss) ? current.editBoss : bosses[0].id) : current.editBoss,
        teacherName:user.displayName || '星際老師', teacherEmail:user.email || ''
      }), () => {
        this._firebaseClassIds = classIds;
        this._firebaseJoinCodes = joinCodes;
        this._firebaseBankIds = bankIds;
        this._firebaseDuplicateClasses = duplicates;
        if (duplicates.length) this._queueFirebaseCleanup();
        this._firebaseLastSignature = this._firebaseSignature();
        this._firebaseHydrating = false;
        // 雲端尚無資料時，把內建的示範班級與題庫寫上去當作起始資料。
        if (!remoteClasses.length || !remoteBanks.length) {
          this._firebaseLastSignature = '';
          this._queueFirebaseSync();
        }
      });
    }, error => { console.error(error); this.showToast('Firebase 同步失敗，請確認 Firestore 規則 ⚠️'); });
    this._connectProgress(user.uid);
    this._connectPhotos(user.uid);
    // 已經登入、網址又帶了 ?tab=，直接跳到那一頁（例如從教師管理中心點「編輯題庫」）。
    if (this._wantedTeacherTab) {
      this.setState({ screen:'app', role:'teacher', tab:this._teacherLandingTab(),
        showTeacherLogin:false, gPickerOpen:false });
    }
  }
  // 老師登入後要落在哪一頁。網址指定的優先，用過就清掉，避免之後切分頁又被拉回來。
  _teacherLandingTab(){
    const allowed = ['dashboard', 'setTasks', 'setBoss', 'setStore'];
    const wanted = this._wantedTeacherTab;
    this._wantedTeacherTab = '';
    return allowed.indexOf(wanted) >= 0 ? wanted : 'dashboard';
  }
  // ── 學生端：把自己的成績寫回雲端 ───────────────────────────────
  _studentRecord(){
    const s = this.state;
    if (s.role !== 'student' || !this._studentClass || !s.sid) return null;
    const mine = (s.classes[s.klass] || []).find(r => r.sid === s.sid) || {};
    return {
      joinCode:this._studentClass.joinCode, teacherId:this._studentClass.teacherId,
      className:this._studentClass.className, sid:s.sid, sno:s.sno || mine.sno || '',
      done:(s.tasks || []).filter(t => t.done).length, coins:s.coins || 0, xp:s.xp || 0,
      // 各任務完成率要靠這個，只有總數算不出來。
      doneTaskIds:(s.tasks || []).filter(t => t.done).map(t => String(t.id)),
      score:mine.score || 0, rounds:mine.rounds || 0, status:mine.status || '— 未測驗',
      bossId:mine.bossId || '', wrongNums:mine.wrongNums || [], hist:mine.hist || [],
      week:mine.week || [0,0,0,0,0]
    };
  }
  _queueStudentSync(){
    const record = this._studentRecord();
    if (!record) return;
    const signature = JSON.stringify(record);
    if (signature === this._studentLastSignature) return;
    this._studentPending = record;
    clearTimeout(this._studentSyncTimer);
    this._studentSyncTimer = setTimeout(() => this._persistStudentProgress(), 800);
  }
  async _persistStudentProgress(){
    const record = this._studentPending;
    if (!record || !window.starAcademyFirebase) return;
    try {
      await window.starAcademyFirebase.signInStudent();
      await window.starAcademyFirebase.saveStudentProgress(record);
      this._studentLastSignature = JSON.stringify(record);
    } catch (error) {
      console.error(error);
      // 沒傳成功就重試，學生的成績不能只留在自己的平板上。
      clearTimeout(this._studentSyncTimer);
      this._studentSyncTimer = setTimeout(() => this._persistStudentProgress(), 5000);
    }
  }
  // 手機直接拍的照片動輒好幾 MB，Firestore 單筆上限 1 MiB，所以先縮到長邊 900px 再轉 JPEG。
  // 幾個會導致縮圖變全黑的坑都要擋：
  //   1. JPEG 沒有透明度，PNG／HEIC 的透明區在轉檔時會變黑 → 先鋪白底。
  //   2. iPhone 高畫素照片超過 canvas 面積上限時，畫出來整片空白 → 限制總像素並抽樣檢查。
  //   3. createImageBitmap 解碼比 Image 可靠，也能依 EXIF 轉正，優先使用。
  async _shrinkPhoto(file){
    const original = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('讀取照片失敗'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    try {
      const source = await this._decodePhoto(file, original);
      const width = source.width || 0, height = source.height || 0;
      if (!width || !height) return original;

      const scale = Math.min(1, 900 / Math.max(width, height), Math.sqrt(2400000 / (width * height)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      if (source.close) source.close();

      if (this._canvasLooksBlank(context, canvas)) return original;
      return canvas.toDataURL('image/jpeg', 0.72);
    } catch (error) { console.error(error); return original; }
  }
  async _decodePhoto(file, dataUrl){
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file, { imageOrientation:'from-image' }); }
      catch (error) { /* 某些瀏覽器不支援選項，往下用 Image */ }
    }
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('照片解碼失敗'));
      image.src = dataUrl;
    });
  }
  // 抽樣檢查縮圖是不是整片同色（全黑／全白），是的話代表這台裝置畫失敗了，寧可傳原圖。
  _canvasLooksBlank(context, canvas){
    try {
      const step = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 12));
      let first = null;
      for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
          const [r, g, b] = context.getImageData(x, y, 1, 1).data;
          const key = r + ',' + g + ',' + b;
          if (first === null) first = key;
          else if (key !== first) return false;
        }
      }
      return true;
    } catch (error) { return false; }
  }
  async _uploadTaskPhoto(taskId, photo){
    if (this.state.role !== 'student' || !this._studentClass || !window.starAcademyFirebase) return;
    const sid = this.state.sid;
    if (!sid || !photo) return;
    const task = (this.state.tasks || []).find(t => t.id === taskId) || {};
    try {
      await window.starAcademyFirebase.signInStudent();
      await window.starAcademyFirebase.saveTaskPhoto({
        joinCode:this._studentClass.joinCode, teacherId:this._studentClass.teacherId,
        className:this._studentClass.className, sid, taskId:String(taskId),
        taskTitle:task.title || '任務', monster:task.monster || '', photo
      });
    } catch (error) {
      console.error(error);
      this.showToast('照片上傳失敗，老師可能看不到，請再送一次 ⚠️');
    }
  }
  // ── 教師端：即時看到全班成績 ─────────────────────────────────
  // 只把進度欄位疊回名冊，不動班級成員，所以不會有覆蓋本地修改的問題。
  _connectProgress(uid){
    if (this._progressStop) this._progressStop();
    this._progressStop = window.starAcademyFirebase.observeClassProgress(uid, rows => {
      if (!rows.length) return;
      const byClass = {};
      rows.forEach(row => {
        if (!row.className || !row.sid) return;
        (byClass[row.className] = byClass[row.className] || {})[row.sid] = row;
      });
      this._firebaseHydrating = true;
      this.setState(current => {
        const classes = {};
        Object.keys(current.classes || {}).forEach(name => {
          const updates = byClass[name];
          classes[name] = (current.classes[name] || []).map(r => {
            const row = updates && updates[r.sid];
            return row ? { ...r, done:row.done, coins:row.coins, score:row.score, rounds:row.rounds,
              status:row.status, bossId:row.bossId, wrongNums:row.wrongNums, hist:row.hist, week:row.week,
              doneTaskIds:Array.isArray(row.doneTaskIds) ? row.doneTaskIds : r.doneTaskIds } : r;
          });
        });
        return { classes };
      }, () => {
        this._firebaseLastSignature = this._firebaseSignature();
        this._firebaseHydrating = false;
      });
    }, error => { console.error(error); this.showToast('讀取學生成績失敗，請確認 Firestore 規則 ⚠️'); });
  }
  // AI 叫不動時的補救題。原本是把同一題原封不動再出一次，還配上「先寫下算式」這種
  // 只適用數學的提示，社會、自然題看了莫名其妙。改成每多一輪就刪掉一個錯誤選項，
  // 選項順序也重排，難度真的會逐輪下降。
  _simplifyQuestion(question, round, index){
    const options = Array.isArray(question.options) ? question.options : [];
    const wrong = options.filter(o => o !== question.answer);
    // 被排除的選項不從清單拿掉，只標成刪除線留在畫面上，
    // 學生才看得到「原來這幾個是最不可能的」，而不是選項莫名其妙變少。
    const removeCount = Math.min(Math.max(0, round - 1), Math.max(0, wrong.length - 1));
    const removed = wrong.slice(wrong.length - removeCount);
    return {
      id:'s' + round + '_' + index, question:question.question, options, answer:question.answer, removed,
      hint:'提示：畫掉的是最不可能的答案，已經幫你排除了。從剩下的選項仔細比較 💪'
    };
  }
  // 名冊裡直接改座號或學號。顯示名稱是從座號推出來的，要一起更新。
  updRosterField(index, key, value){
    const text = String(value).trim();
    this.setState(s => ({
      classes: { ...s.classes, [s.klass]: (s.classes[s.klass] || []).map((r, j) => j !== index ? r
        : { ...r, [key]: text, name: key === 'sid' ? (text ? text + ' 號' : '學員') : r.name }) }
    }));
  }
  // 教師端：訂閱全班的拍照打卡照片，存在實例上而不是 state，
  // 免得又觸發一次教師資料回寫。
  _connectPhotos(uid){
    if (this._photoStop) this._photoStop();
    this._photoStop = window.starAcademyFirebase.observeTaskPhotos(uid, rows => {
      const byStudent = {};
      rows.forEach(row => {
        if (!row.className || !row.sid) return;
        const key = row.className + '|' + row.sid;
        (byStudent[key] = byStudent[key] || []).push(row);
      });
      Object.keys(byStudent).forEach(key => byStudent[key].sort(
        (a, b) => String(a.taskTitle || '').localeCompare(String(b.taskTitle || ''))));
      this._taskPhotos = byStudent;
      this.forceUpdate();
    }, error => { console.error(error); this.showToast('讀取學生照片失敗，請確認 Firestore 規則 ⚠️'); });
  }
  _detailPhotos(record){
    if (!record || !this._taskPhotos) return [];
    return (this._taskPhotos[this.state.klass + '|' + record.sid] || []).map(item => ({
      title:item.taskTitle || '任務',
      monster:item.monster ? '打倒 ' + item.monster : '',
      open:() => this._openPhotoViewer(item.photo, (record.sid || '') + ' 號 · ' + (item.taskTitle || '任務')),
      // 照片走 <img src>，不能塞進 style 字串：data URL 內含 ';'，
      // 會被樣式解析器當成屬性分隔而把網址截斷，縮圖就變成一片空白。
      photo:item.photo,
      style:'width:100%;height:150px;object-fit:cover;border-radius:12px;'
        + 'border:1px solid rgba(90,200,120,.45);cursor:zoom-in;background:rgba(0,0,0,.35);display:block'
    }));
  }
  // 點縮圖看原尺寸。用純 DOM 疊一層，不進 state，才不會牽動同步或重繪。
  _openPhotoViewer(photo, caption){
    if (!photo) return;
    const overlay = document.createElement('div');
    overlay.setAttribute('style', 'position:fixed;inset:0;z-index:300;background:rgba(6,4,20,.92);'
      + 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;cursor:zoom-out');
    const image = document.createElement('img');
    image.src = photo;
    image.setAttribute('style', 'max-width:min(1100px,94vw);max-height:80vh;border-radius:16px;'
      + 'border:1px solid rgba(125,232,255,.45);box-shadow:0 24px 60px rgba(0,0,0,.6);background:#fff');
    const label = document.createElement('div');
    label.textContent = caption + '（點任一處或按 Esc 關閉）';
    label.setAttribute('style', 'color:#c8baff;font-size:14px;font-weight:700;text-align:center');
    overlay.append(image, label);

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }
  // ── 全班學習分析 ─────────────────────────────────────────────
  _pctBar(pct, tone){
    const colors = { bad:'#ff9ac0,#d84a7a', warn:'#ffd45e,#ffb100', good:'#7de8a0,#3aa860', info:'#7de8ff,#8a6aff' };
    return 'width:' + Math.max(2, Math.min(100, pct)) + '%;height:100%;border-radius:999px;'
      + 'background:linear-gradient(90deg,' + (colors[tone] || colors.info) + ')';
  }
  _classAnalytics(){
    const s = this.state;
    const roster = s.classes[s.klass] || [], tasks = s.tasks || [], bosses = s.bosses || [];
    const tested = roster.filter(r => r.rounds > 0);
    const round = n => Math.round(n);
    const rate = (part, whole) => whole ? round(part / whole * 100) : 0;

    // 錯題分析：wrongNums 記的是第一輪答錯的題號，依 Boss 分組才對得上題目。
    const wrongByBoss = {};
    tested.forEach(r => {
      const bossId = r.bossId || (bosses[0] && bosses[0].id);
      if (!bossId) return;
      const bucket = wrongByBoss[bossId] = wrongByBoss[bossId] || { attempts:0, counts:{} };
      bucket.attempts++;
      (r.wrongNums || []).forEach(n => { bucket.counts[n] = (bucket.counts[n] || 0) + 1; });
    });
    const wrongRows = [];
    Object.keys(wrongByBoss).forEach(bossId => {
      const boss = bosses.find(b => b.id === bossId), bucket = wrongByBoss[bossId];
      Object.keys(bucket.counts).forEach(num => {
        const question = boss && boss.questions && boss.questions[Number(num) - 1];
        const pct = rate(bucket.counts[num], bucket.attempts);
        wrongRows.push({
          label:'第 ' + num + ' 題' + (boss ? '（' + (boss.name || 'Boss') + '）' : ''),
          text:question ? String(question.question).slice(0, 34) : '（題目已異動）',
          pctText:pct + '%　' + bucket.counts[num] + '／' + bucket.attempts + ' 人答錯',
          sort:pct, bar:this._pctBar(pct, pct >= 50 ? 'bad' : pct >= 25 ? 'warn' : 'good')
        });
      });
    });
    wrongRows.sort((a, b) => b.sort - a.sort);

    // 任務分析：doneTaskIds 是學生端回傳的，舊資料沒有就退回用完成總數估算。
    const hasTaskDetail = roster.some(r => Array.isArray(r.doneTaskIds));
    const taskRows = tasks.map(task => {
      const done = hasTaskDetail
        ? roster.filter(r => (r.doneTaskIds || []).indexOf(String(task.id)) >= 0).length
        : 0;
      const pct = rate(done, roster.length);
      return {
        label:String(task.title || '任務').slice(0, 26),
        subject:(task.subject || '') + (task.monster ? ' · ' + task.monster : ''),
        pctText:pct + '%　' + done + '／' + roster.length + ' 人完成',
        sort:pct, bar:this._pctBar(pct, pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad')
      };
    }).sort((a, b) => b.sort - a.sort);

    // 需要關注的學生：沒測過、標記求助、或分數偏低。
    const watchRows = roster.filter(r => !r.rounds || String(r.status || '').indexOf('🆘') >= 0 || r.score < 60)
      .map(r => ({
        label:r.sid + ' 號',
        reason:!r.rounds ? '尚未進行 Boss 挑戰'
          : String(r.status || '').indexOf('🆘') >= 0 ? '已標記需要老師協助'
          : '最新成績 ' + (r.score || 0) + ' 分，未達 60'
      }));

    const photoCount = Object.keys(this._taskPhotos || {})
      .filter(key => key.indexOf(s.klass + '|') === 0)
      .reduce((total, key) => total + this._taskPhotos[key].length, 0);
    const avgScore = tested.length ? round(tested.reduce((a, r) => a + (r.score || 0), 0) / tested.length) : 0;
    const avgRounds = tested.length ? Math.round(tested.reduce((a, r) => a + (r.rounds || 0), 0) / tested.length * 10) / 10 : 0;

    return {
      cards:[
        { label:'已完成測驗', value:tested.length + ' / ' + roster.length + ' 人', note:'尚未測驗 ' + (roster.length - tested.length) + ' 人' },
        { label:'班級平均成績', value:avgScore + ' 分', note:tested.length ? '以已測驗的 ' + tested.length + ' 人計算' : '尚無資料' },
        { label:'一輪就通過', value:rate(tested.filter(r => r.rounds === 1 && r.score >= 100).length, tested.length) + '%', note:'比例越高代表教學越到位' },
        { label:'平均測驗輪數', value:avgRounds + ' 輪', note:'越接近 1 表示題目難度合適' },
        { label:'任務完成率', value:rate(roster.reduce((a, r) => a + (r.done || 0), 0), roster.length * Math.max(1, tasks.length)) + '%', note:'全班所有任務平均' },
        { label:'打卡照片', value:photoCount + ' 張', note:'學生上傳的作業佐證' }
      ],
      wrongRows:wrongRows.slice(0, 8), hasWrong:wrongRows.length > 0,
      taskRows, hasTaskDetail, hasTasks:taskRows.length > 0,
      watchRows, hasWatch:watchRows.length > 0,
      empty:roster.length === 0
    };
  }
  // 班級改名時要沿用同一筆雲端文件與同一組班級代碼，
  // 否則雲端會多出一筆重複班級，已經發給學生的連結也會失效。
  _carryFirebaseClassKey(oldName, newName){
    ['_firebaseClassIds', '_firebaseJoinCodes'].forEach(key => {
      const map = this[key];
      if (!map || !map[oldName]) return;
      map[newName] = map[oldName];
      delete map[oldName];
    });
  }
  // 學生用 ?class=班級代碼 開啟遊戲時，不必登入就載入該班的公開副本。
  async _loadStudentClass(joinCode){
    if (!window.starAcademyFirebase || !window.starAcademyFirebase.configured) return;
    try {
      const data = await window.starAcademyFirebase.loadPublicClass(joinCode);
      if (!data || !data.className) { this.showToast('找不到這個班級代碼，請跟老師確認連結'); return; }
      this._studentClass = { joinCode, className:data.className, teacherId:data.teacherId || '' };
      const roster = this._labelRoster(data.roster || []);
      const bosses = (data.bosses || []).map(b => ({
        id:b.id, name:b.name || '未命名 Boss', subject:b.subject || '未分類',
        icon:b.icon || '👾', questions:Array.isArray(b.questions) ? b.questions : []
      }));
      this._firebaseHydrating = true;
      this.setState(current => ({
        classes: { [data.className]: roster },
        klass: data.className,
        bosses: bosses.length ? bosses : current.bosses,
        editBoss: bosses.length ? bosses[0].id : current.editBoss,
        tasks: Array.isArray(data.tasks) && data.tasks.length ? data.tasks : current.tasks,
        items: Array.isArray(data.items) && data.items.length ? data.items : current.items
      }), () => {
        this._firebaseHydrating = false;
        this.showToast('已載入「' + data.className + '」');
      });
    } catch (error) {
      console.error(error);
      this.showToast(error && error.code === 'permission-denied'
        ? '讀不到班級資料，請老師到 Firebase 更新 Firestore 規則'
        : '載入班級失敗，請確認網路連線');
    }
  }
  async firebaseLogin(){
    if (!window.starAcademyFirebase || !window.starAcademyFirebase.configured) { this.showToast('尚未設定 Firebase，請先填好 web/.env.local'); return; }
    try {
      // 先取出目標分頁，_connectFirebase 之後才不會被這裡的 setState 蓋回 dashboard。
      const tab = this._teacherLandingTab();
      const user = await window.starAcademyFirebase.signIn();
      this._connectFirebase(user);
      this.setState({ screen:'app', role:'teacher', tab, teacherName:user.displayName, teacherEmail:user.email, showTeacherLogin:false, gPickerOpen:false, klassRename:this.state.klass });
      this.showToast('👋 ' + user.displayName + '，已連上你的 Firebase 資料');
    } catch (error) { console.error(error); this.showToast('Google 登入未完成，請再試一次'); }
  }
  firebaseLogout(){
    // 存檔是延遲 650ms 才寫出去的。剛改完就登出的話，那筆修改（例如剛刪掉的班級）
    // 會連同計時器一起被丟掉，重新登入又整個回來。所以要先把它補寫完再登出。
    clearTimeout(this._firebaseSyncTimer);
    const pending = this._firebaseUser && this._firebaseSignature() !== this._firebaseLastSignature
      ? this._persistFirebaseData()
      : Promise.resolve();
    pending.catch(error => console.error(error)).then(() => {
      if (this._firebaseDataStop) { this._firebaseDataStop(); this._firebaseDataStop = null; }
      if (this._progressStop) { this._progressStop(); this._progressStop = null; }
      if (this._photoStop) { this._photoStop(); this._photoStop = null; }
      this._firebaseUser = null;
      if (window.starAcademyFirebase) window.starAcademyFirebase.signOut().catch(error => console.error(error));
    });
  }
`

// 題目匯入解析器。原版先呼叫 window.claude.complete 做 AI 分析，但那是原始 Claude 沙箱
// 才有的 API，自架環境沒有，所以實際上永遠退回這裡的解析。這份支援老師手邊常見的格式：
//   （４）2. 題目？ ①選項一 ②選項二 ③選項三 ④選項四
//   （  ）2. 題目？ ①… ②… ③… ④…        ← 括號留白＝未標答案，先填第一個並提醒老師
//   2. 題目？ (A)… (B)… (C)… (D)…
//   題目, 選項A, 選項B, 選項C, 選項D, 答案   ← 原本的 CSV／TSV
const questionParser = String.raw`  parseCsv(txt){
    this._importUnanswered = 0;
    const delimited = this._parseDelimitedQuestions(txt);
    if (delimited.length) return delimited;
    return this._parseNumberedQuestions(txt);
  }
  _parseDelimitedQuestions(txt){
    const out = [];
    txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
      const cells = (line.includes('\t') ? line.split('\t') : line.split(/[,，]/)).map(c => c.trim()).filter(c => c !== '');
      if (cells.length < 6 || /題目/.test(cells[0])) return;
      const question = cells[0], options = cells.slice(1, 5), raw = cells[5];
      const index = this._answerIndex(raw);
      const answer = index !== null && options[index] ? options[index] : raw;
      if (options.includes(answer)) out.push({ id:'csv' + Date.now() + Math.random(), question, options, answer });
    });
    return out;
  }
  // 把「①」「(A)」「４」「答案：3」都認成同一個選項代號。
  _answerIndex(raw){
    const text = String(raw == null ? '' : raw).trim()
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248))
      .replace(/[Ａ-Ｄａ-ｄ]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248));
    if (!text) return null;
    const circled = '①②③④⑤⑥⑦⑧⑨'.indexOf(text[0]);
    if (circled >= 0) return circled;
    const digit = text.match(/[1-9]/);
    if (digit) return Number(digit[0]) - 1;
    const letter = text.match(/[A-Da-d]/);
    if (letter) return letter[0].toUpperCase().charCodeAt(0) - 65;
    return null;
  }
  _parseNumberedQuestions(txt){
    const normalized = String(txt).replace(/　/g, ' ');
    // 以「（Ｘ）1.」或「1.」開頭視為新的一題，其餘併入上一題（選項換行時用得到）。
    const starts = /^\s*(?:[（(][^)）]{0,4}[)）])?\s*\d+\s*[.、)]/;
    const blocks = [];
    normalized.split(/\r?\n/).forEach(line => {
      if (!line.trim()) return;
      if (starts.test(line) || !blocks.length) blocks.push(line.trim());
      else blocks[blocks.length - 1] += ' ' + line.trim();
    });
    const out = [];
    blocks.forEach((block, i) => {
      let body = block;
      let answerRaw = '';
      const marked = body.match(/^\s*[（(]([^)）]{0,4})[)）]\s*/);
      if (marked) { answerRaw = marked[1]; body = body.slice(marked[0].length); }
      body = body.replace(/^\s*\d+\s*[.、)]\s*/, '');

      const styles = [/[①②③④⑤⑥⑦⑧⑨]/g, /[（(]\s*[A-Da-d]\s*[)）]/g, /(?:^|\s)[A-Da-d]\s*[.、)]\s*/g];
      let parts = null;
      for (const style of styles) {
        const split = body.split(style);
        if (split.length >= 3) { parts = split; break; }
      }
      if (!parts) return;

      const question = parts[0].replace(/\s+$/, '').trim();
      const options = parts.slice(1).map(o => o.replace(/[。\s]+$/, '').trim()).filter(Boolean);
      if (!question || options.length < 2) return;

      const index = this._answerIndex(answerRaw);
      const known = index !== null && options[index] !== undefined;
      if (!known) this._importUnanswered++;
      out.push({ id:'q' + Date.now() + '_' + i, question, options, answer: known ? options[index] : options[0] });
    });
    return out;
  }
`

// 登入畫面保持原樣；已登入的老師只在背景接上 Firestore，不強制跳到指揮中心。
const componentDidMountInit = String.raw`
    const nativeSetState = this.setState.bind(this);
    this.setState = (updater, callback) => nativeSetState(updater, () => {
      if (callback) callback();
      this._queueFirebaseSync();
      this._queueStudentSync();
    });
    if (window.starAcademyFirebase) {
      this._firebaseAuthStop = window.starAcademyFirebase.observeAuth(user => {
        // 學生是匿名登入，不能把他當成老師去讀取班級資料。
        if (user && !user.isAnonymous) this._connectFirebase(user);
      });
      const params = new URLSearchParams(location.search);
      const joinCode = (params.get('class') || '').trim().toUpperCase();
      if (joinCode) this._loadStudentClass(joinCode);
      // 從教師管理中心點「編輯題庫」等按鈕過來時，已登入就直接進到指定分頁，
      // 不用再按一次教師入口。
      this._wantedTeacherTab = params.get('tab') || '';
    }
`

function patchGameScript() {
  const gameScript = document.querySelector<HTMLScriptElement>('script[data-dc-script]')
  if (!gameScript?.textContent) throw new Error('找不到星際冒險學院的遊戲程式。')

  const patches: [string | RegExp, string][] = [
    ['  componentDidMount(){\n', `${firebaseMethods}\n  componentDidMount(){\n${componentDidMountInit}`],
    [
      '      openGPicker: () => this.setState(x => ({ gPickerOpen: !x.gPickerOpen })),',
      '      openGPicker: () => this.firebaseLogin(),',
    ],
    // 兩個面板改成置中對話框後不能同時開啟，否則會疊在一起。
    [
      '      toggleTeacher: () => this.setState(x => ({ showTeacherLogin: !x.showTeacherLogin })),',
      '      toggleTeacher: () => this.setState(x => ({ showTeacherLogin: !x.showTeacherLogin, showParent:false })),',
    ],
    [
      '      toggleParent: () => this.setState(x => ({ showParent: !x.showParent })),',
      '      toggleParent: () => this.setState(x => ({ showParent: !x.showParent, showTeacherLogin:false })),',
    ],
    // 改名前先把雲端文件 id 與班級代碼搬到新名稱底下。
    [
      '        this.setState(x => {\n'
        + '          const c = {}; Object.keys(x.classes).forEach(k => { c[k === old ? n : k] = x.classes[k]; });\n'
        + '          return { classes: c, klass: n };\n'
        + '        });',
      '        this._carryFirebaseClassKey(old, n);\n'
        + '        this.setState(x => {\n'
        + '          const c = {}; Object.keys(x.classes).forEach(k => { c[k === old ? n : k] = x.classes[k]; });\n'
        + '          return { classes: c, klass: n, klassRename: n };\n'
        + '        });',
    ],
    // 原本只認得「題目, 選項A, …, 答案」這種六欄 CSV，改成也吃老師實際手邊的考卷格式。
    [
      /  parseCsv\(txt\)\{[\s\S]*?\n  \}\n  async analyzeImport\(\)\{/,
      `${questionParser}\n  async analyzeImport(){`,
    ],
    // 沒標答案的題目會先填第一個選項，必須明確告訴老師去改，不能讓錯的答案默默進題庫。
    [
      "importStatus:`✅ 已分析並新增 ${qs.length} 題`",
      "importStatus: this._importUnanswered"
        + " ? `✅ 已新增 ${qs.length} 題，其中 ${this._importUnanswered} 題沒有標示答案，已暫填第一個選項，請在下方題目清單修正`"
        + " : `✅ 已分析並新增 ${qs.length} 題`",
    ],
    [
      "importStatus:'❌ 無法解析，請確認每行為：題目, 選項A, 選項B, 選項C, 選項D, 答案'",
      "importStatus:'❌ 無法解析。可用格式：（４）1. 題目？ ①選項 ②選項 ③選項 ④選項，或每行「題目, 選項A, 選項B, 選項C, 選項D, 答案」'",
    ],
    // 被排除的選項要留在畫面上並畫掉，不能點；其餘維持原本樣式。
    [
      /    const opts = curQ \? curQ\.options\.map\(o => \{[\s\S]*?\n    \}\) : \[\];/,
      "    const opts = curQ ? curQ.options.map(o => {\n"
        + "      const ruledOut = Array.isArray(curQ.removed) && curQ.removed.indexOf(o) >= 0;\n"
        + "      let st = baseOpt + 'background:rgba(255,255,255,.08);border:2px solid rgba(160,140,255,.4)';\n"
        + "      if (s.fb) {\n"
        + "        if (o === curQ.answer) st = baseOpt + 'background:rgba(90,200,120,.25);border:2px solid #5ac878';\n"
        + "        else if (o === s.fb.pick) st = baseOpt + 'background:rgba(216,74,122,.25);border:2px solid #d84a7a';\n"
        + "        else st = baseOpt + 'background:rgba(255,255,255,.04);border:2px solid rgba(255,255,255,.15);opacity:.6';\n"
        + "      }\n"
        + "      if (ruledOut) st = baseOpt + 'background:rgba(255,255,255,.03);border:2px dashed rgba(255,255,255,.2);"
        + "color:#7a749c;text-decoration:line-through;cursor:not-allowed';\n"
        + "      return { text: ruledOut ? o + '　✖ 已排除' : o, style: st,\n"
        + "        pick: ruledOut ? () => this.showToast('這個選項已經幫你排除了，從沒被畫掉的選項裡挑 🙂') : () => this.pick(o) };\n"
        + "    }) : [];",
    ],
    // AI 失敗時不要再出一模一樣的題目配數學提示。
    [
      /    \} catch \(e\) \{\n      newQs = wrongQs\.map\(\(q, i\) => \(\{ id:'f'[^\n]+\n      this\.showToast\('AI 暫時忙線[^\n]+\n    \}/,
      "    } catch (e) {\n"
        + "      console.error(e);\n"
        + "      newQs = wrongQs.map((q, i) => this._simplifyQuestion(q, nextN, i));\n"
        + "      this.showToast('AI 沒有回應，改用刪去錯誤選項的簡化題');\n"
        + "    }",
    ],
    // 學生端自己的照片預覽同樣不能把 data URL 塞進 style 字串，改由 <img src> 帶。
    [
      "      photoStyle: t.photo ? `width:100%;height:110px;border-radius:12px;border:1px solid rgba(90,200,120,.4);background:rgba(0,0,0,.35) url(${JSON.stringify(t.photo)}) center/cover no-repeat` : '',",
      "      photoStyle: 'width:100%;height:110px;object-fit:cover;display:block;border-radius:12px;"
        + "border:1px solid rgba(90,200,120,.4);background:rgba(0,0,0,.35)',",
    ],
    [
      "      upPhotoStyle: s.uploadPhoto ? `width:100%;height:240px;border-radius:16px;border:1px solid rgba(125,232,255,.35);background:rgba(0,0,0,.35) url(${JSON.stringify(s.uploadPhoto)}) center/contain no-repeat` : '',",
      "      upPhotoStyle: 'width:100%;height:240px;object-fit:contain;display:block;border-radius:16px;"
        + "border:1px solid rgba(125,232,255,.35);background:rgba(0,0,0,.35)',",
    ],
    // 照片先縮圖再放進 state，之後才塞得進 Firestore。
    [
      "        const r = new FileReader();\n        r.onload = () => this.setState({ uploadPhoto: String(r.result) });\n        r.readAsDataURL(f);",
      "        this._shrinkPhoto(f)\n"
        + "          .then(photo => this.setState({ uploadPhoto: photo }))\n"
        + "          .catch(() => this.showToast('照片讀取失敗，請再試一次 📷'));",
    ],
    // 送出打卡時把照片一併傳給老師。
    [
      '        this.attack(id, photo);\n      },',
      '        this.attack(id, photo);\n        this._uploadTaskPhoto(id, photo);\n      },',
    ],
    // 詳情面板要拿得到該生的照片。
    [
      "      detailOpen: !!dRec, detailName: dRec ? `${dRec.sid} 號 ${dRec.name}` : '',",
      "      detailOpen: !!dRec, detailName: dRec ? `${dRec.sid} 號` : '',\n"
        + "      detailPhotos: this._detailPhotos(dRec),\n"
        + "      hasDetailPhotos: this._detailPhotos(dRec).length > 0,\n"
        + "      analytics: this._classAnalytics(),",
    ],
    // 名冊列可直接改座號與學號。
    [
      "      snoText: r.sno || '—',",
      "      snoText: r.sno || '—',\n"
        + "      snoValue: r.sno || '',\n"
        + "      setSid: e => this.updRosterField(i, 'sid', e.target.value),\n"
        + "      setSno: e => this.updRosterField(i, 'sno', e.target.value),",
    ],
    // 學生登入改成只認座號與學號，不再收姓名（去識別化）。
    // 學號留白時，從已載入的班級名冊用座號補上，家長查詢才找得到人。
    [
      /      loginStudent: \(\) => \{\n        const st = this\.state, name = [^\n]+\n/,
      "      loginStudent: () => {\n"
        + "        const st = this.state, sid = (st.loginSid || '').trim();\n"
        + "        if (!sid) { this.showToast('請先填座號'); return; }\n"
        + "        const mate = (st.classes[st.klass] || []).find(r => r.sid === sid) || {};\n"
        + "        const sno = (st.loginSno || '').trim() || mate.sno || '', name = sid + ' 號';\n",
    ],
    // 匯出的試算表同樣不帶姓名。
    ["['班級','座號','學號','姓名','討伐進度'", "['班級','座號','學號','討伐進度'"],
    ["s.klass, r.sid, r.sno || '—', r.name,", "s.klass, r.sid, r.sno || '—',"],
    // 名冊去識別化：以座號辨識學生，不再輸入姓名。
    [
      /      addStu: \(\) => \{[\s\S]*?\n      \},/,
      "      addStu: () => {\n"
        + "        const sid = (this.state.stuSid || '').trim(), sno = (this.state.stuSno || '').trim();\n"
        + "        if (!sid) { this.showToast('請填座號'); return; }\n"
        + "        if ((this.state.classes[this.state.klass] || []).some(r => r.sid === sid)) { this.showToast('這個座號已經在名單裡了'); return; }\n"
        + "        this.setState(x => ({ classes: { ...x.classes, [x.klass]: [...x.classes[x.klass], { sid, name: sid + ' 號', sno, done:0, score:0, coins:0, rounds:0, status:'— 未測驗', wrongNums:[], week:[0,0,0,0,0] }] }, stuSid:'', stuName:'', stuSno:'' }));\n"
        + "        this.showToast('已把 ' + sid + ' 號加入 ' + this.state.klass);\n"
        + "      },",
    ],
    [
      /      loginTeacher: \(\) => \{[\s\S]*?\n      \},\n      logout: \(\) => [^\n]+,/,
      "      loginTeacher: () => this.firebaseLogin(),\n"
        + "      logout: () => { if (this.state.role === 'teacher') this.firebaseLogout(); this.setState({ screen:'login', showTeacherLogin:false, showParent:false, checkinOpen:false, noticeOpen:false, gPickerOpen:false, tPwd:'' }); },",
    ],
  ]

  let source = gameScript.textContent
  for (const [pattern, replacement] of patches) {
    const patched = source.replace(pattern, replacement)
    if (patched === source) throw new Error(`遊戲程式與預期不符，無法套用 Firebase 修補：${pattern}`)
    source = patched
  }
  gameScript.textContent = source
}

// 教師／家長面板現在是置中對話框，按 Esc 或點背景就收起（沿用遊戲自己的「收起」按鈕）。
function installLoginOverlayDismiss() {
  const dismiss = () => {
    if (!document.querySelector('[data-login-panel]')) return
    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-login-actions] button')
    for (const button of buttons) {
      if (button.textContent?.startsWith('收起')) button.click()
    }
  }
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') dismiss() })
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    if (target?.matches('[data-screen-label="登入"]')) dismiss()
  })
}

function loadGameRuntime() {
  const runtime = document.createElement('script')
  runtime.src = '/game-support.js'
  runtime.onerror = () => console.error('無法載入星際冒險學院的遊戲執行環境 /game-support.js')
  document.head.appendChild(runtime)
}

installBridge()
installAI()
patchGameScript()
installLoginOverlayDismiss()
loadGameRuntime()
