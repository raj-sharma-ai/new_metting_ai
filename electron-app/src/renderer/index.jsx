import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import styles from './App.css';

const existing = document.getElementById('app-styles');
if (existing) {
  existing.textContent = styles;
} else {
  const styleTag = document.createElement('style');
  styleTag.id = 'app-styles';
  styleTag.textContent = styles;
  document.head.appendChild(styleTag);
}

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(<App />);
} else {
  console.error('❌ Failed to find root element for renderer');
}

