const { app, BrowserWindow } = require('electron');
const path = require('path');
const { execSync } = require('child_process');
const fixPath = require('fix-path');

// Windows 终端设置 UTF-8 编码，防止中文日志乱码
if (process.platform === 'win32') {
  try { execSync('chcp 65001', { stdio: 'ignore' }); } catch (_) {}
}

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