
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { App as CapApp } from '@capacitor/app';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// 处理 Android 物理返回键
CapApp.addListener('backButton', ({ canGoBack }) => {
  if (!canGoBack) {
    // 如果在游戏主界面按返回键，直接退出应用
    CapApp.exitApp();
  } else {
    window.history.back();
  }
});

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
