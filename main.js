const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fixPath = require('fix-path');

const isProd = !process.argv.includes('--dev') && app.isPackaged;

// 修复环境变量
fixPath();

// 引入后端
let server;
try {
  server = require('./server/index.js');
} catch (e) {
  console.error('❌ 后端加载失败，请检查根目录 node_modules:', e);
}

let mainWindow;

function createWindow() {
  // 生产环境隐藏顶部菜单栏
  if (isProd) {
    Menu.setApplicationMenu(null);
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "terminalManage",
    icon: path.join(__dirname, 'client/dist/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (isProd) {
    // 禁用 DevTools
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });

    // 拦截快捷键：F12、Ctrl+Shift+I、Ctrl+Shift+J、Ctrl+Shift+C
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') {
        event.preventDefault();
        return;
      }
      if (input.control && input.shift && ['I', 'J', 'C'].includes(input.key.toUpperCase())) {
        event.preventDefault();
      }
    });
  }

  // 这样跟你的前端代码 (import.meta.env.DEV ? ... : undefined) 也能配合
  if (server) {
      server.listen(0, () => {
        // 获取分配到的真实端口
        const port = server.address().port;
        console.log(`🚀 terminalManage 已启动，自动分配端口: ${port}`);
        
        // 加载这个端口的页面
        mainWindow.loadURL(`http://localhost:${port}`);
      });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});