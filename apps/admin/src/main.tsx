import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ApiProvider } from './context/ApiContext';
import { AuthProvider } from './context/AuthContext';
import { App } from './App';
import './styles/global.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Elemento #root não encontrado em index.html.');

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <ApiProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ApiProvider>
    </BrowserRouter>
  </StrictMode>,
);
