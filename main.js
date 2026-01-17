const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    resizable: false,
    autoHideMenuBar: true, // 隐藏菜单栏
    webPreferences: {
      // 这里的配置为了方便游戏读取本地资源，做了小幅调整
    nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true, // 允许在 file:// 协议下运行模块
    }
  });

  // 这里的路径逻辑进行了加固
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    win.loadURL('http://localhost:3000');
  } else {
    // 使用 path.join 确保在 Windows/Mac 下路径都正确
    win.loadFile(path.join(__dirname, 'index.html'));
  }

  // 如果你想在打包后也能直接看到报错，可以取消下面这一行的注释
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});