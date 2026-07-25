import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
