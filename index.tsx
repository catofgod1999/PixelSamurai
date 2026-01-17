
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { App as CapApp } from '@capacitor/app';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// 安全处理 Capacitor 逻辑
const initNativeListeners = async () => {
  try {
    // 检查是否在原生环境（Capacitor 会注入原生对象）
    if (CapApp && typeof CapApp.addListener === 'function') {
      CapApp.addListener('backButton', ({ canGoBack }) => {
        if (!canGoBack) {
          CapApp.exitApp();
        } else {
          window.history.back();
        }
      });
    }
  } catch (e) {
    console.log("Non-native environment detected, skipping Capacitor listeners.");
  }
};

initNativeListeners();

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
