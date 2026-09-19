import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { IncomingMessage } from 'node:http';

function firebaseAdmin() {
  if (getApps().length) return getApps()[0]!;
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (!projectId || !clientEmail || !privateKey) return null;
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export async function requireUser(req: IncomingMessage) {
  const app = firebaseAdmin();
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (app && bearer) {
    const token = await getAuth(app).verifyIdToken(bearer);
    return { uid: token.uid, email: token.email || null };
  }

  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH !== 'false') {
    const uid = String(req.headers['x-bcr-workspace'] || 'local-development').slice(0, 128);
    return { uid, email: null };
  }

  if (!app) throw Object.assign(new Error('Firebase Admin 환경변수가 설정되지 않았습니다.'), { statusCode: 503 });
  throw Object.assign(new Error('로그인이 필요합니다.'), { statusCode: 401 });
}
