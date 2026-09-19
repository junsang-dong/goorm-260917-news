import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirebaseWebConfig, isFirebaseConfigured, type AuthUser } from './config';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

function mapUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

export function getFirebaseAuth(): Auth {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase 웹 설정이 없습니다. .env의 VITE_FIREBASE_* 값을 확인하세요.');
  }
  if (!app) {
    const c = getFirebaseWebConfig();
    app = getApps().length
      ? getApps()[0]!
      : initializeApp({
          apiKey: c.apiKey!,
          authDomain: c.authDomain!,
          projectId: c.projectId!,
          storageBucket: c.storageBucket || undefined,
          messagingSenderId: c.messagingSenderId || undefined,
          appId: c.appId!,
        });
    auth = getAuth(app);
  }
  return auth!;
}

export function subscribeAuth(handler: (user: AuthUser | null) => void) {
  const a = getFirebaseAuth();
  return onAuthStateChanged(a, (user) => handler(mapUser(user)));
}

export async function signInWithGoogle() {
  const a = getFirebaseAuth();
  try {
    const result = await signInWithPopup(a, provider);
    return mapUser(result.user);
  } catch (e) {
    const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: string }).code) : '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('로그인 창이 닫혔습니다. 다시 시도해 주세요.');
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('브라우저가 팝업을 차단했습니다. 팝업을 허용한 뒤 다시 시도해 주세요.');
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error('이 도메인이 Firebase 승인 목록에 없습니다. Firebase Console → Authentication → Settings → Authorized domains에 localhost를 추가하세요.');
    }
    if (code === 'auth/operation-not-allowed') {
      throw new Error('Google 로그인이 비활성화되어 있습니다. Firebase Console → Authentication → Sign-in method에서 Google을 사용 설정하세요.');
    }
    throw new Error(e instanceof Error ? e.message : 'Google 로그인에 실패했습니다.');
  }
}

export async function signOutGoogle() {
  await firebaseSignOut(getFirebaseAuth());
}

export async function apiHeaders(json = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  if (isFirebaseConfigured()) {
    const user = getFirebaseAuth().currentUser;
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }
  if (!headers.Authorization && import.meta.env?.DEV) headers['X-BCR-Workspace'] = 'local-development';
  return headers;
}
