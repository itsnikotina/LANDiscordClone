import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { useAuthStore } from './store/authStore';

async function main() {
  // Initialize auth from localStorage before rendering
  await useAuthStore.getState().initialize();
  
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

main();
