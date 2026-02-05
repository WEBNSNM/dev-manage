const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const app = express();
app.use(cors());

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
const killProcessTree = (child, projectName) => {
  if (!child) return;

  try {
    if (process.platform === 'win32') {
      // Windows: 使用 taskkill 杀掉进程树 (/T) 和 强制杀 (/F)
      // child.pid 是父进程(cmd/npm)，我们需要连带杀掉它启动的 node/vite
      if (child.pid) {
          exec(`taskkill /pid ${child.pid} /f /t`, (err) => {
              if(err) console.log(`[Kill] Windows 杀进程可能有残留或已结束: ${err.message}`);
          });
      }
    } else {
      // Mac/Linux: 杀掉进程组
      // 注意：spawn 时需要 detached: true 才能杀进程组，但在 shell:true 模式下通常直接 kill 也可以
      child.kill('SIGKILL');
    }
    console.log(`💀 已终止进程: ${projectName}`);
  } catch (e) {
    console.error(`❌ 杀进程失败:`, e);
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
  socket.on('scan-dir', (dirPath) => {
    const projects = scanProjects(dirPath);
    
    // 扫描后，检查一下哪些项目实际上还在 processes 内存里跑着
    // 防止前端刷新后状态丢失
    const enrichedProjects = projects.map(p => ({
        ...p,
        running: processes.has(p.name) // 恢复运行状态
    }));
    
    socket.emit('projects-loaded', enrichedProjects);
  });

  // 3. 启动任务
  socket.on('start-task', ({ projectName, script, projectPath, runner }) => {
    const currentRunner = runner || 'npm';
    if (processes.has(projectName)) return;

    console.log(`🚀 [后端] 启动: ${projectName} (${currentRunner} run ${script})`);
    
    let cmd = currentRunner;
    if (process.platform === 'win32') cmd = `${currentRunner}.cmd`;

    const child = spawn(cmd, ['run', script], {
      cwd: projectPath,
      shell: true,
      stdio: 'pipe', 
      env: { ...process.env, FORCE_COLOR: '1' } 
    });

    processes.set(projectName, child);
    io.emit('status-change', { name: projectName, running: true });

    const logHandler = (data) => io.emit('log', { name: projectName, data: data.toString() });
    child.stdout.on('data', logHandler);
    child.stderr.on('data', logHandler);

    child.on('error', (err) => {
       io.emit('log', { name: projectName, data: `❌ 启动失败: ${err.message}` });
    });

    child.on('close', (code) => {
      // 只有当 Map 里还有这个进程时才广播停止 (防止是手动 Kill 触发的重复广播)
      if (processes.has(projectName)) {
          processes.delete(projectName);
          io.emit('status-change', { name: projectName, running: false });
          io.emit('log', { name: projectName, data: `\r\n[Exited with code ${code}]\r\n` });
      }
    });
  });

  // 4. 停止任务
  socket.on('stop-task', (projectName) => {
    console.log(`🛑 [指令] 停止项目: ${projectName}`);
    const child = processes.get(projectName);
    
    // 无论找不找得到句柄，都先通知前端变红，防止UI卡死
    processes.delete(projectName);
    socket.emit('status-change', { name: projectName, running: false });

    if (child) {
        killProcessTree(child, projectName);
        socket.emit('log', { name: projectName, data: '\r\n\x1b[31m[用户手动停止]\x1b[0m\r\n' });
    } else {
        socket.emit('log', { name: projectName, data: '\r\n[警告] 进程句柄已丢失，已重置状态\r\n' });
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
});

// --- ✨ 核心修复：监听主进程退出事件 ---
const cleanup = () => {
    console.log('\n\n🧹 DevMaster 正在关闭，清理所有子进程...');
    
    if (processes.size === 0) {
        console.log('✅ 没有活动的子进程。');
        process.exit(0);
    }

    // 遍历所有正在运行的进程并杀掉
    for (const [name, child] of processes) {
        console.log(`正在终止: ${name}...`);
        killProcessTree(child, name);
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

server.listen(3000, () => {
  console.log('✅ DevMaster 服务已启动: http://localhost:3000');
  console.log('👉 按 Ctrl+C 关闭服务 (会自动清理子进程)');
});