const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const app = express();
app.use(cors());

const clientDistPath = path.join(__dirname, '../client/dist');
console.log('🎨 前端静态资源路径:', clientDistPath);
// 👇 2. 托管静态文件 (加个判断，防止报错)
if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
} else {
    console.warn('⚠️ 警告: 未找到前端 build 目录，网页可能无法访问。请确保执行了 npm run build');
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 存储运行中的子进程: Map<projectName, ChildProcess>
const processes = new Map();

// --- 🛠️ 核心工具：强力杀进程函数 ---
const killProcessTree = (child, taskKey) => {
  if (!child || !child.pid) return;

  console.log(`💀 [KILL] 正在终止任务: ${taskKey} (PID: ${child.pid})`);

  try {
    if (process.platform === 'win32') {
      // 🪟 Windows: 使用 taskkill 强制(/f) 杀掉进程树(/t)
      // spawn('taskkill', ...) 这种方式有时会失败，exec 更稳
      exec(`taskkill /pid ${child.pid} /f /t`, (err) => {
        // 忽略 "没有找到进程" 的错误，说明已经死了
        if (err && !err.message.includes('not found')) {
            console.error(`[Kill Error] Windows: ${err.message}`);
        }
      });
    } else {
      // 🍎🐧 Mac/Linux: 杀掉进程组
      // 注意：spawn 时必须设置 detached: true，否则无法作为组来杀
      try {
        process.kill(-child.pid, 'SIGKILL'); // PID 前加负号表示杀进程组
      } catch (e) {
        // 忽略 ESRCH (进程已不存在)
        if (e.code !== 'ESRCH') console.error(`[Kill Error] Unix: ${e.message}`);
      }
    }
  } catch (e) {
    console.error(`❌ 杀进程异常:`, e);
  }
};

// --- 递归扫描核心逻辑 (含包管理器识别) ---
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
      else if (fs.existsSync(path.join(currentPath, 'bun.lockb'))) runner = 'bun';

      // console.log(`✅ 发现项目 [${runner}]: ${folderName}`);
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

// 封装扫描入口
const scanProjects = (dirPath) => {
  console.log(`\n🔍 开始深度扫描: ${dirPath}`);
  if (!fs.existsSync(dirPath)) return [];
  const results = scanRecursively(dirPath);
  console.log(`📊 扫描结束，共找到 ${results.length} 个项目`);
  return results;
};

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

  // 2. 扫描目录
  // --- 2. 扫描目录 (并在扫描时同步运行状态) ---
  socket.on('scan-dir', (dirPath) => {
    // 1. 获取静态文件列表
    const projects = scanProjects(dirPath);
    
    // 2. [关键步骤] 拿着静态列表去 processes Map 里对账
    // 目的是：刷新页面后，前端能知道哪些脚本还在跑
    const enrichedProjects = projects.map(p => {
        const runningScripts = {};
        
        // 遍历后端内存中所有正在运行的任务 key (例如 "MyProject:dev")
        for (const [taskKey] of processes) {
            // 检查这个任务是不是属于当前项目
            // 格式约定: "项目名:脚本名"
            if (taskKey.startsWith(`${p.name}:`)) {
                const scriptName = taskKey.split(':')[1];
                if (scriptName) {
                    runningScripts[scriptName] = true;
                }
            }
        }

        return {
            ...p,
            runningScripts // 把同步好的状态带给前端
        };
    });
    
    // 3. 发送带有运行状态的列表
    socket.emit('projects-loaded', enrichedProjects);
  });

// --- 3. 启动任务 (支持并发) ---
  socket.on('start-task', ({ projectName, script, projectPath, runner }) => {
    const taskKey = `${projectName}:${script}`;
    if (processes.has(taskKey)) return;

    const currentRunner = runner || 'npm';
    console.log(`🚀 [后端] 启动: ${taskKey}`);
    
    let cmd = currentRunner;
    if (process.platform === 'win32') cmd = `${currentRunner}.cmd`;

    // 🌟 关键修改：Mac/Linux 开启 detached 以便后续杀进程组
    const isWin = process.platform === 'win32';
    
    const child = spawn(cmd, ['run', script], {
      cwd: projectPath,
      shell: true, // Windows 必须 true
      detached: !isWin, // 🌟 非 Windows 开启独立进程组
      stdio: 'pipe', 
      env: { ...process.env, FORCE_COLOR: '1' } 
    });

    processes.set(taskKey, child);
    io.emit('status-change', { name: projectName, script, running: true });

    const logHandler = (data) => io.emit('log', { name: projectName, data: data.toString() });
    child.stdout.on('data', logHandler);
    child.stderr.on('data', logHandler);

    child.on('error', (err) => {
       io.emit('log', { name: projectName, data: `❌ 启动失败: ${err.message}` });
    });

    child.on('close', (code) => {
      if (processes.has(taskKey)) {
          processes.delete(taskKey);
          io.emit('status-change', { name: projectName, script, running: false });
          io.emit('log', { name: projectName, data: `\r\n[${script} exited with code ${code}]\r\n` });
      }
    });
  });

  // --- 4. 停止任务 (杀死该项目下的所有进程) ---
  socket.on('stop-task', (projectName) => {
    console.log(`🛑 [指令] 强杀项目: ${projectName}`);
    
    // 转换为数组进行遍历，防止在遍历中删除 Map 导致的问题
    const activeTasks = Array.from(processes.entries());

    for (const [key, child] of activeTasks) {
        // 匹配 "ProjectName:dev", "ProjectName:build"
        if (key.startsWith(`${projectName}:`)) {
            const scriptName = key.split(':')[1];
            
            // 1. 先从内存移除
            processes.delete(key);
            
            // 2. 立即通知前端变红 (UI 响应优先)
            socket.emit('status-change', { name: projectName, script: scriptName, running: false });
            
            // 3. 执行系统级查杀
            killProcessTree(child, key);
        }
    }
    socket.emit('log', { name: projectName, data: '\r\n\x1b[31m[ ☠️ 已执行强制终止指令 ]\x1b[0m\r\n' });
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

// 监听 Ctrl+C (SIGINT) 和 终止信号 (SIGTERM)
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
// ----------------------------------------

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

// 判断：如果是直接通过 node server/index.js 运行的 -> 启动 3000 端口
if (require.main === module) {
    server.listen(3000, () => {
        console.log('✅ 开发模式运行中...', `localhost://3000`);
    });
}

// 必须导出 server，让 main.js 去控制启动
module.exports = server;