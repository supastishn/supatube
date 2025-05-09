import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter as Router } from 'react-router-dom'; // Change import
import { AuthProvider } from './context/AuthContext';
import App from './App.jsx';
import './index.css';
import eruda from 'eruda';

// Initialize Eruda console (temporarily disabled to troubleshoot conflicts)
// eruda.init();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </StrictMode>,
);
