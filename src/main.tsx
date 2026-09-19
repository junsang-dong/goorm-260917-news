import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import './styles.css';
import './video-player.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } } });

function Root() {
  return (
    <QueryClientProvider client={client}>
      <AuthProvider onSignedOut={() => client.clear()}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
