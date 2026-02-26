import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme';
import { CheckinProvider } from './hooks/useCheckin';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <CheckinProvider>
          <App />
        </CheckinProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
