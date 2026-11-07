import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AppProvider } from './app/AppContext.tsx';
import { createServices } from './services/container.ts';
import './index.css';

// Created once, outside React, so re-renders never re-create the data layer.
const services = createServices();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider services={services}>
      <App />
    </AppProvider>
  </StrictMode>,
);
