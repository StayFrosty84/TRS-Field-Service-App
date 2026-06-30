import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';
import { initTheme } from './lib/theme.js';
import { ensureSeedWorkTypes, ensureSeedStages } from './db/db.js';
import { ensureSeedDemoData } from './lib/seedDemo.js';
import { init as initSync } from './lib/sync/engine.js';

initTheme();
ensureSeedWorkTypes()
  .then(() => ensureSeedStages())
  .then(() => ensureSeedDemoData())
  .finally(() => initSync()); // resume Google Drive sync if previously connected

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
