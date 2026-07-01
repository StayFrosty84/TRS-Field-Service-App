import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';
import { initTheme } from './lib/theme.js';
import { ensureSeedWorkTypes, ensureSeedStages, ensureSeedLists } from './db/db.js';
import { ensureSeedDemoData } from './lib/seedDemo.js';

initTheme();
ensureSeedWorkTypes()
  .then(() => ensureSeedStages())
  .then(() => ensureSeedLists())
  .then(() => ensureSeedDemoData());

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
