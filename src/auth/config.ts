export type AppMode = 'local' | 'cloud';

export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

export function getAppMode(): AppMode {
  return import.meta.env.VITE_APP_MODE === 'cloud' ? 'cloud' : 'local';
}

export function getFirebaseWebConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim();
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim();
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim();
  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim();

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket,
    messagingSenderId,
    measurementId,
  };
}

export function isFirebaseConfigured() {
  const c = getFirebaseWebConfig();
  return Boolean(c.apiKey && c.authDomain && c.projectId && c.appId);
}

export function assertCloudConfig() {
  if (getAppMode() === 'cloud' && !isFirebaseConfigured()) {
    throw new Error('클라우드 모드인데 Firebase 설정이 없습니다. VITE_FIREBASE_* 환경변수를 확인하세요.');
  }
}
