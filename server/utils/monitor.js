console.log('🔥 monitor.js 模块被加载了');
const pidusage = require('pidusage');
const pidtree = require('pidtree');

// 存储监控目标：Key = 项目ID/名称, Value = 根进程 PID (npm 的 PID)
const targets = new Map();
let isRunning = false;

/**
 * 添加监控任务
 * @param {string} projectId 项目唯一标识
 * @param {number} pid 进程 PID
 */
const addMonitor = (projectId, pid) => {
  targets.set(projectId, pid);
};

/**
 * 移除监控任务
 * @param {string} projectId 
 */
const removeMonitor = (projectId) => {
  const pid = targets.get(projectId);
  if (pid) {
    // 停止 pidusage 内部的监控，释放资源
    pidusage.unmonitor(pid); 
    targets.delete(projectId);
  }
};

/**
 * 获取单个项目的真实资源占用（聚合子进程）
 */
const getProjectStats = async (rootPid) => {
  try {
    // 1. 找到所有子孙进程的 PID (例如 npm -> node -> vite)
    const children = await pidtree(rootPid).catch(() => []);
    // 2. 把父进程自己也加上
    const allPids = [rootPid, ...children];

    // 3. 获取所有进程的统计数据
    const stats = await pidusage(allPids);

    // 4. 累加所有进程的 CPU 和 内存
    let totalCpu = 0;
    let totalMem = 0;

    Object.values(stats).forEach(s => {
      totalCpu += s.cpu;
      totalMem += s.memory;
    });

    return { cpu: totalCpu, memory: totalMem };
  } catch (err) {
    // 进程可能刚退出，忽略错误
    return null;
  }
};

/**
 * 启动轮询 (建议在 socket 连接建立后调用)
 * @param {Object} io Socket.io 实例
 */
const startLoop = (io) => {
  if (isRunning) return;
  isRunning = true;
  console.log('✅ 监控循环已启动');
  setInterval(async () => {
    // 👇👇👇 加这行调试日志 👇👇👇
    if (targets.size === 0) return;

    const payload = {};
    
    // 遍历所有正在运行的项目
    for (const [id, pid] of targets.entries()) {
      const data = await getProjectStats(pid);
      if (data) {
        payload[id] = {
          cpu: data.cpu.toFixed(1), // 保留1位小数
          memory: data.memory       // 原始字节数
        };
      }
    }

    // 广播给前端
    if (Object.keys(payload).length > 0) {
      io.emit('monitor:update', payload);
    }
  }, 2000); // 2秒刷新一次，避免消耗过多自身 CPU
};

module.exports = { addMonitor, removeMonitor, startLoop };