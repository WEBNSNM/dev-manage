<script setup>
import { ref, onMounted, computed, watch, onUnmounted } from 'vue'
import io from 'socket.io-client'
import ProjectList from '../../components/ProjectList.vue' // 引入刚才的皮肤组件

const socketURL = import.meta.env.DEV ? 'http://localhost:3000' : undefined
const socket = io(socketURL)

// --- 状态定义 ---
const currentPath = ref('')
const rawProjects = ref([])
const projectLogs = ref({})
const hiddenProjectNames = ref(new Set())
const showHidden = ref(false)
const isScanning = ref(false)
const stats = ref({}) // 存放实时监控数据

// --- 初始化 ---
onMounted(() => {
  const savedPath = localStorage.getItem('last-workspace')
  if (savedPath) {
    currentPath.value = savedPath
    isScanning.value = true
    socket.emit('scan-dir', savedPath)
  }

  const savedHidden = localStorage.getItem('hidden-projects')
  if (savedHidden) {
    hiddenProjectNames.value = new Set(JSON.parse(savedHidden))
  }
  
  // 建立连接日志
  socket.on('connect', () => console.log('✅ Socket已连接'))
})

onUnmounted(() => {
  socket.off('monitor:update')
  socket.off('projects-loaded')
  socket.off('status-change')
  socket.off('log')
})

watch(hiddenProjectNames, (newSet) => {
  localStorage.setItem('hidden-projects', JSON.stringify([...newSet]))
}, { deep: true })

// --- 计算属性 ---
const visibleProjects = computed(() => {
  if (showHidden.value) return rawProjects.value
  return rawProjects.value.filter(p => !hiddenProjectNames.value.has(p.name))
})

const projectCountLabel = computed(() => {
  const total = rawProjects.value.length
  const visible = visibleProjects.value.length
  return total === visible ? `${total}` : `${visible} / ${total}`
})

const runningProjectCount = computed(() => {
  return rawProjects.value.filter(p => 
    p.runningScripts && Object.values(p.runningScripts).some(Boolean)
  ).length
})

// --- Socket 事件处理 ---

// 1. 收到监控数据
socket.on('monitor:update', (data) => {
  // data Key 是 "ProjectName:script"，我们需要映射到 ProjectPath
  Object.keys(data).forEach(taskKey => {
    const [projName] = taskKey.split(':')
    const project = rawProjects.value.find(p => p.name === projName)
    if (project) {
      stats.value[project.path] = data[taskKey]
    }
  })
})

// 2. 加载项目列表
socket.on('projects-loaded', (data) => {
  isScanning.value = false
  rawProjects.value = data.map(p => ({
    ...p,
    runningScripts: p.runningScripts || {}
  }))
})

// 3. 状态变更
socket.on('status-change', ({ name, script, running }) => {
  const p = rawProjects.value.find(x => x.name === name)
  if (p) {
    if (!p.runningScripts) p.runningScripts = {}
    p.runningScripts[script] = running
    // 停止时清理监控数据
    if (!running && stats.value[p.path]) {
      // 只有当所有脚本都停止时才完全删除监控显示? 
      // 简单起见，如果收到停止信号，可以暂时不管，monitor:update 会自动停止推送
    }
  }
})

socket.on('project:stopped', ({ id }) => {
  // 这里的 ID 可能是 path 或 name，视后端实现而定，做个防御清理
  if (stats.value[id]) delete stats.value[id]
})

// 4. 日志
socket.on('log', ({ name, data }) => {
  if (!projectLogs.value[name]) projectLogs.value[name] = []
  projectLogs.value[name].push(data)
})

socket.on('folder-selected', path => {
  currentPath.value = path
  localStorage.setItem('last-workspace', path)
  isScanning.value = true
})

// --- 动作方法 ---
const manualScan = () => {
  if (currentPath.value) {
    isScanning.value = true
    rawProjects.value = [] // 清空以显示 loading 态
    socket.emit('scan-dir', currentPath.value)
  }
}

const openNativeDialog = () => socket.emit('open-folder-dialog')

const handleRun = (p, script) => {
  // 如果是 dev 类脚本，清空一下旧日志
  if (['dev', 'start', 'serve'].includes(script)) {
    projectLogs.value[p.name] = []
  }
  socket.emit('start-task', {
    projectName: p.name,
    script,
    projectPath: p.path,
    runner: p.runner
  })
}

const handleStop = (p) => {
  socket.emit('stop-task', p.name)
  // 乐观更新 UI
  if (p.runningScripts) {
    Object.keys(p.runningScripts).forEach(k => p.runningScripts[k] = false)
  }
  if (stats.value[p.path]) delete stats.value[p.path]
}

const toggleHide = (p) => {
  if (hiddenProjectNames.value.has(p.name)) hiddenProjectNames.value.delete(p.name)
  else hiddenProjectNames.value.add(p.name)
}
</script>

<template>
  <div class="flex flex-col min-h-screen font-sans text-white bg-gray-900">
    <div class="sticky top-0 z-10 flex flex-col items-center gap-4 p-4 bg-gray-800 border-b border-gray-700 shadow-lg md:flex-row">
      <h1 class="flex items-center gap-2 text-xl font-bold text-blue-400 whitespace-nowrap">
        <span>⚡</span> DevMaster
      </h1>

      <div class="flex flex-1 w-full gap-2">
        <input
          v-model="currentPath"
          @keyup.enter="manualScan"
          :disabled="isScanning"
          type="text"
          class="w-full px-3 py-2 font-mono text-sm text-gray-300 bg-gray-900 border border-gray-600 rounded focus:outline-none focus:border-blue-500 disabled:opacity-50"
          placeholder="输入路径或点击右侧按钮选择..."
        />
        <button @click="openNativeDialog" :disabled="isScanning" class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 whitespace-nowrap disabled:opacity-50">
          📂 <span class="hidden sm:inline">选择</span>
        </button>
        <button @click="manualScan" :disabled="isScanning" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm font-medium whitespace-nowrap transition shadow-sm shadow-blue-900/50 flex items-center gap-2 disabled:opacity-50 min-w-[80px] justify-center">
          <span v-if="!isScanning">🔄</span>
          <svg v-else class="w-4 h-4 text-white animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          {{ isScanning ? '扫描中' : '扫描' }}
        </button>
      </div>

      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2 px-3 py-1 text-xs bg-gray-900 border border-gray-700 rounded-full" :class="{ 'border-green-900/50 bg-green-900/10': runningProjectCount > 0 }">
          <div :class="['w-2 h-2 rounded-full transition-all', runningProjectCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-600']"></div>
          <span :class="runningProjectCount > 0 ? 'text-green-400 font-bold' : 'text-gray-500'">Running: {{ runningProjectCount }}</span>
        </div>
        <div class="flex items-center gap-2 px-3 py-1 text-xs text-gray-400 bg-gray-900 border border-gray-700 rounded-full">
          <span>Total:</span><span class="font-bold text-blue-400">{{ projectCountLabel }}</span>
        </div>
        <label class="flex items-center gap-2 cursor-pointer hover:text-gray-300">
          <input type="checkbox" v-model="showHidden" class="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-0">
          <span class="text-xs text-gray-400">显示隐藏</span>
        </label>
      </div>
    </div>

    <div class="relative flex-1 p-6 overflow-auto">
      <div v-if="isScanning && visibleProjects.length === 0" class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm">
        <div class="w-12 h-12 mb-4 border-b-2 border-blue-500 rounded-full animate-spin"></div>
        <p class="text-blue-400 animate-pulse">正在深度扫描...</p>
      </div>

      <ProjectList 
        :projects="visibleProjects"
        :stats="stats"
        :logs="projectLogs"
        :hidden-set="hiddenProjectNames"
        @run="handleRun"
        @stop="handleStop"
        @open-folder="(path) => socket.emit('open-project-folder', path)"
        @open-file="(uri) => socket.emit('open-file', uri)"
        @toggle-hide="toggleHide"
      />
    </div>
  </div>
</template>