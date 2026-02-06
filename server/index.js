const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
// ⚠️ 注意：这里假设你的 monitor.js 在 utils 目录下
// 如果你的 monitor.js 在 server 根目录，请改为 require('./monitor')
const monitor = require('./utils/monitor'); 

const app = express();
app.use(cors());

const clientDistPath = path.join(__dirname, '../client/dist');

if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ✅ 1. 启动监控循环
monitor.startLoop(io);

// 存储运行中的子进程: Map<taskKey, ChildProcess>
const processes = new Map();

// --- 工具函数 ---
const killProcessTree = (child, taskKey) => {
  if (!child || !child.pid) return;
  console.log(`💀 [KILL] 正在终止: ${taskKey} (PID: ${child.pid})`);
  try {
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${child.pid} /f /t`, (err) => {
         if (err && !err.message.includes('not found')) console.error(err.message);
      });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch (e) { console.error(e); }
};

const scanRecursively = (currentPath, depth = 0) => {
  if (depth > 4) return [];
  const folderName = path.basename(currentPath);
if (['node_modules', '.git', 'dist', 'build', '.idea', '.vscode', 'public', 'uni_modules', 'static'].includes(folderName)) {
    return [];
  }

  const pkgPath = path.join(currentPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      let runner = 'npm'; 
      if (fs.existsSync(path.join(currentPath, 'pnpm-lock.yaml'))) runner = 'pnpm';
      else if (fs.existsSync(path.join(currentPath, 'yarn.lock'))) runner = 'yarn';
      
      return [{
        name: folderName,
        path: currentPath,
        runner: runner, 
        scripts: pkg.scripts || {}
      }];
    } catch (e) { return []; }
  }

  let results = [];
  try {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        results = results.concat(scanRecursively(path.join(currentPath, entry.name), depth + 1));
      }
    }
  } catch (err) {}
  return results;
};

const scanProjects = (dirPath) => {
  if (!fs.existsSync(dirPath)) return [];
  return scanRecursively(dirPath);
};

// --- Socket 逻辑 ---
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
// 1. 弹窗选择文件夹 (Base64 PowerShell)
  socket.on('open-folder-dialog', () => {
    console.log('正在唤起置顶弹窗...');
    const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        $form = New-Object System.Windows.Forms.Form
        $form.TopMost = $true
        $form.StartPosition = "CenterScreen"
        $form.ShowInTaskbar = $false
        $form.Opacity = 0
        $form.Show()
        $form.Activate()
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = "请选择项目父目录"
        $result = $dialog.ShowDialog($form)
        if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }
        $form.Close()
        $form.Dispose()
    `;
    const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64');
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand]);

    child.stdout.on('data', (data) => {
        const selectedPath = data.toString().trim();
        if (selectedPath) {
            socket.emit('folder-selected', selectedPath);
            const projects = scanProjects(selectedPath);
            socket.emit('projects-loaded', projects);
        }
    });
  });

  // 1. 扫描目录
  socket.on('scan-dir', (dirPath) => {
    const projects = scanProjects(dirPath);
    // 同步运行状态
    const enrichedProjects = projects.map(p => {
        const runningScripts = {};
        for (const [taskKey] of processes) {
            if (taskKey.startsWith(`${p.name}:`)) {
                runningScripts[taskKey.split(':')[1]] = true;
            }
        }
        return { ...p, runningScripts };
    });
    socket.emit('projects-loaded', enrichedProjects);
  });

  // 2. 启动任务 (核心修改：加入监控)
  socket.on('start-task', ({ projectName, script, projectPath, runner }) => {
    const taskKey = `${projectName}:${script}`;
    if (processes.has(taskKey)) return;

    const currentRunner = runner || 'npm';
    console.log(`🚀 启动任务: ${taskKey}`);
    
    let cmd = currentRunner;
    if (process.platform === 'win32') cmd = `${currentRunner}.cmd`;

    const child = spawn(cmd, ['run', script], {
      cwd: projectPath,
      shell: true,
      detached: process.platform !== 'win32',
      stdio: 'pipe', 
      env: { ...process.env, FORCE_COLOR: '1' } 
    });

    processes.set(taskKey, child);
    
    if (child.pid) {
      // 注意：这里用 taskKey (如 VueAdmin:dev) 作为 ID
      monitor.addMonitor(taskKey, child.pid);
      console.log(`➕ 已添加监控: ${taskKey}, PID: ${child.pid}`);
    }

    io.emit('status-change', { name: projectName, script, running: true });

    const logHandler = (data) => io.emit('log', { name: projectName, data: data.toString() });
    child.stdout.on('data', logHandler);
    child.stderr.on('data', logHandler);
    child.on('error', (err) => {
       io.emit('log', { name: projectName, data: `❌ 启动失败: ${err.message}` });
    });

    child.on('close', (code) => {
      if (processes.has(taskKey)) {
          // ✅ 进程退出，移除监控
          monitor.removeMonitor(taskKey);
          processes.delete(taskKey);
          io.emit('status-change', { name: projectName, script, running: false });
          io.emit('log', { name: projectName, data: `\n[Exited with code ${code}]\n` });
      }
    });
  });

  // 3. 停止任务
  // --- 4. 停止任务 (修复版) ---
  socket.on('stop-task', (projectName) => {
    console.log(`🛑 [收到指令] 请求停止项目: ${projectName}`);
    
    // 1. 先把 Map 转成数组，防止在遍历时修改 Map 导致循环中断
    const allTasks = Array.from(processes.entries());
    let found = false;

    for (const [key, child] of allTasks) {
        // key 的格式是 "项目名:脚本名" (例如 "VueAdmin:dev")
        // 所以我们检查 key 是否以 "VueAdmin:" 开头
        if (key.startsWith(`${projectName}:`)) {
            found = true;
            const scriptName = key.split(':')[1];
            console.log(`   - 匹配到任务: ${key} (PID: ${child.pid})，正在终止...`);

            // 2. 移除监控
            try {
              monitor.removeMonitor(key);
            } catch (e) {
              console.error('   - 移除监控失败:', e.message);
            }
            
            // 3. 从内存移除
            processes.delete(key);
            
            // 4. 通知前端变红
            socket.emit('status-change', { name: projectName, script: scriptName, running: false });
            
            // 5. 杀进程
            killProcessTree(child, key);
        }
    }

    if (!found) {
        console.warn(`⚠️ 未找到项目 [${projectName}] 的任何运行任务。当前运行列表:`, Array.from(processes.keys()));
        // 强制告诉前端：这个项目没在跑，把它变红（防止前端卡在绿色状态）
        // 既然找不到具体的 script，我们无法精确变红，但通常这意味着后端重启过
        // 你可以选择发一个特殊的事件重置前端，或者忽略
    } else {
        socket.emit('log', { name: projectName, data: '\r\n\x1b[31m[ ☠️ 已执行强制终止指令 ]\x1b[0m\r\n' });
    }
  });

  // 5. 打开文件 (VS Code)
  socket.on('open-file', (filePath) => {
      // 防止命令注入的简单过滤
      if (!filePath || /[&|;]/.test(filePath)) return;
      exec(`code -g "${filePath}"`, (err) => {
          if (err) exec(`explorer /select,"${filePath.split(':')[0]}"`); // 降级方案
      });
  });
  // --- 打开项目所在的文件夹 (资源管理器) ---
  socket.on('open-project-folder', (projectPath) => {
    console.log('📂 请求打开文件夹:', projectPath);
    
    if (!projectPath) return;

    let cmd;
    // 根据不同系统选择命令
    if (process.platform === 'win32') {
      // Windows: explorer "C:\path\to\folder"
      cmd = `explorer "${projectPath}"`;
    } else if (process.platform === 'darwin') {
      // Mac: open "/path/to/folder"
      cmd = `open "${projectPath}"`;
    } else {
      // Linux: xdg-open "/path/to/folder"
      cmd = `xdg-open "${projectPath}"`;
    }

    exec(cmd, (err) => {
      if (err) {
        console.error('打开文件夹失败:', err);
      }
    });
  });
});

// --- ✨ 核心修复：监听主进程退出事件 ---
const cleanup = () => {
    console.log('\n\n🧹 DevMaster 正在关闭，清理所有子进程...');
    
    if (processes.size === 0) {
        console.log('✅ 没有活动的子进程。');
        process.exit(0);
    }

    // 遍历所有正在运行的进程并杀掉
    for (const [key, child] of processes) {
        // key 可能是 "Project:dev"
        console.log(`正在终止: ${key}...`);
        killProcessTree(child, key);
    }
    
    // 给一点点时间让 taskkill 执行完
    setTimeout(() => {
        console.log('👋 再见！');
        process.exit(0);
    }, 500);
};

process.on('SIGINT', cleanup);
// 👇 2. 在文件最底部，server.listen 之前，添加“兜底路由”
// 作用：无论用户访问什么 URL，如果不是 API，都返回 index.html (支持 Vue Router history 模式)
app.get(/.*/, (req, res) => {
    const indexPath = path.join(clientDistPath, 'index.html');
    
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Backend is running, but index.html not found.');
    }
});
if (require.main === module) {
    server.listen(3000, () => console.log('✅ Server running on 3000'));
}

module.exports = server;