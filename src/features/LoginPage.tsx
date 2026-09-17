import { useState } from 'react';
import { Radar } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage({ onDone }: { onDone: () => void }) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleGoogle() {
    setBusy(true);
    setMessage('');
    try {
      await auth.signIn();
      onDone();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark"><Radar size={32} /></span>
          <div>
            <b>BCR<span className="brand-dot">.</span> RADAR</b>
            <small>ROBOTICS INTELLIGENCE</small>
          </div>
        </div>
        <h1>Google로 로그인</h1>
        <p>블루클라우드 로보틱스 워크스페이스에 Google 계정으로 접속합니다. 이메일·비밀번호 가입은 제공하지 않습니다.</p>
        {auth.error && <p className="form-error" role="alert">{auth.error}</p>}
        {message && <p className="form-error" role="alert">{message}</p>}
        <button className="google-button" type="button" disabled={busy || !auth.enabled} onClick={() => void handleGoogle()}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l.1.1 6.2 5.2C39.2 36.3 44 31 44 24c0-1.3-.1-2.7-.4-3.5z"/>
          </svg>
          {busy ? '로그인 중…' : 'Google 계정으로 계속'}
        </button>
        <p className="login-note">자료는 아직 이 브라우저(IndexedDB)에 저장됩니다. Neon 계정 동기화는 후속 단계입니다.</p>
        <button className="text-button" type="button" onClick={onDone}>로그인 없이 로컬로 계속</button>
      </div>
    </div>
  );
}
