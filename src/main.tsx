import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { useAuthStore } from './stores/authStore';

// Initialize auth on app start
useAuthStore.getState().initialize();

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
