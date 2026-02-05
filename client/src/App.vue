<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import io from 'socket.io-client'
import TerminalView from './components/TerminalView.vue'

const socket = io('http://localhost:3000')

// --- 状态管理 ---
const currentPath = ref('')
const rawProjects = ref([]) // 原始项目列表
const projectLogs = ref({})
const hiddenProjectNames = ref(new Set())
const showHidden = ref(false)
const isScanning = ref(false) // 🌀 新增：扫描加载状态

// --- 初始化与本地存储 ---
onMounted(() => {
  const savedPath = localStorage.getItem('last-workspace')
  if (savedPath) {
    currentPath.value = savedPath
    // 页面加载时自动扫一次
    isScanning.value = true
    socket.emit('scan-dir', savedPath)
  }

  const savedHidden = localStorage.getItem('hidden-projects')
  if (savedHidden) {
    hiddenProjectNames.value = new Set(JSON.parse(savedHidden))
  }
})

watch(
  hiddenProjectNames,
  newSet => {
    localStorage.setItem('hidden-projects', JSON.stringify([...newSet]))
  },
  { deep: true }
)

// --- 计算属性 ---
const visibleProjects = computed(() => {
  if (showHidden.value) return rawProjects.value
  return rawProjects.value.filter(p => !hiddenProjectNames.value.has(p.name))
})

// 📊 新增：项目统计
const projectCountLabel = computed(() => {
  const total = rawProjects.value.length
  const visible = visibleProjects.value.length
  if (total === visible) return `${total}`
  return `${visible} / ${total}`
})

// --- Socket 监听 ---
socket.on('folder-selected', path => {
  console.log('收到路径:', path)
  currentPath.value = path
  localStorage.setItem('last-workspace', path)
  // 收到路径意味着后端即将开始扫描（或正在扫描），开启 Loading
  isScanning.value = true
})

socket.on('projects-loaded', data => {
  console.log('项目列表已加载')
  // 关闭 Loading
  isScanning.value = false

  // 状态合并逻辑
  rawProjects.value = data.map(p => {
    const exist = rawProjects.value.find(old => old.name === p.name)
    return { ...p, running: exist ? exist.running : false }
  })
})

socket.on('status-change', ({ name, running }) => {
  const p = rawProjects.value.find(x => x.name === name)
  if (p) p.running = running
})

socket.on('log', ({ name, data }) => {
  if (!projectLogs.value[name]) projectLogs.value[name] = []
  projectLogs.value[name].push(data)
})

// --- 交互功能 ---
const openNativeDialog = () => {
  // 点击选择文件夹时，不需要立即 Loading，等收到 folder-selected 再转圈
  socket.emit('open-folder-dialog')
}

const manualScan = () => {
  if (currentPath.value) {
    isScanning.value = true // 🌀 手动点击开始转圈
    // 清空列表，给用户一种“正在重刷”的感觉
    rawProjects.value = []
    localStorage.setItem('last-workspace', currentPath.value)
    socket.emit('scan-dir', currentPath.value)
  }
}

const toggleHideProject = p => {
  if (hiddenProjectNames.value.has(p.name)) {
    hiddenProjectNames.value.delete(p.name)
  } else {
    hiddenProjectNames.value.add(p.name)
  }
}

// 传递 runner 给后端
const runScript = (p, script) => {
  projectLogs.value[p.name] = []
  // ✨ 增加 runner 字段
  socket.emit('start-task', {
    projectName: p.name,
    script,
    projectPath: p.path,
    runner: p.runner // <--- 关键
  })
}

const stopScript = p => {
  socket.emit('stop-task', p.name)
  p.running = false
}

const handleOpenFile = uri => {
  socket.emit('open-file', uri)
}

// 根据包管理器返回颜色样式
const getRunnerBadgeStyle = runner => {
  switch (runner) {
    case 'pnpm':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/50'
    case 'yarn':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50'
    case 'bun':
      return 'bg-pink-500/20 text-pink-400 border-pink-500/50'
    default:
      return 'bg-red-500/20 text-red-400 border-red-500/50' // npm
  }
}
</script>

<template>
  <div class="flex flex-col min-h-screen font-sans text-white bg-gray-900">
    <div
      class="sticky top-0 z-10 flex flex-col items-center gap-4 p-4 bg-gray-800 border-b border-gray-700 shadow-lg md:flex-row"
    >
      <h1 class="flex items-center gap-2 text-xl font-bold text-blue-400 whitespace-nowrap">
        <span>⚡</span> DevMaster
      </h1>

      <div class="flex flex-1 w-full gap-2">
        <input
          v-model="currentPath"
          @keyup.enter="manualScan"
          :disabled="isScanning"
          type="text"
          placeholder="输入路径或点击右侧按钮选择..."
          class="w-full px-3 py-2 font-mono text-sm text-gray-300 bg-gray-900 border border-gray-600 rounded focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />

        <button
          @click="openNativeDialog"
          :disabled="isScanning"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium transition bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          title="打开系统文件夹选择框"
        >
          📂 <span class="hidden sm:inline">选择</span>
        </button>

        <button
          @click="manualScan"
          :disabled="isScanning"
          class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm font-medium whitespace-nowrap transition shadow-sm shadow-blue-900/50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed min-w-[80px] justify-center"
        >
          <svg
            v-if="isScanning"
            class="w-4 h-4 text-white animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            ></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <span v-else>🔄</span>

          {{ isScanning ? '扫描中' : '扫描' }}
        </button>
      </div>

      <div class="flex items-center self-end gap-4 ml-0 md:ml-4 md:self-auto">
        <div
          class="flex items-center gap-2 px-3 py-1 font-mono text-xs text-gray-400 bg-gray-900 border border-gray-700 rounded-full"
        >
          <span>Total:</span>
          <span class="font-bold text-blue-400">{{ projectCountLabel }}</span>
        </div>

        <label
          class="flex items-center gap-2 transition cursor-pointer select-none hover:text-gray-300"
        >
          <input
            type="checkbox"
            v-model="showHidden"
            class="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-0"
          />
          <span class="text-xs text-gray-400">显示已隐藏</span>
        </label>
      </div>
    </div>

    <div class="relative flex-1 p-6 overflow-auto">
      <div
        v-if="isScanning && visibleProjects.length === 0"
        class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm"
      >
        <div class="w-12 h-12 mb-4 border-b-2 border-blue-500 rounded-full animate-spin"></div>
        <p class="text-blue-400 animate-pulse">正在深度扫描项目目录...</p>
        <p class="mt-2 text-xs text-gray-500">如果是初次扫描可能需要几秒钟</p>
      </div>

      <div
        v-if="!isScanning && visibleProjects.length === 0"
        class="flex flex-col items-center justify-center h-[50vh] text-gray-500"
      >
        <div class="mb-4 text-6xl opacity-50">📂</div>
        <p class="text-xl">未找到项目</p>
        <p class="mt-2 text-sm opacity-70">请选择项目父目录，或者检查是否被全部隐藏了</p>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="p in visibleProjects"
          :key="p.name"
          class="relative flex flex-col transition bg-gray-800 border border-gray-700 rounded-lg shadow-xl group hover:border-blue-500/30"
        >
          <div
            class="flex items-center justify-between p-3 pl-4 bg-gray-800 border-b border-gray-700 rounded-t-lg"
          >
            <div class="flex items-center gap-3 overflow-hidden">
              <div
                :class="[
                  'w-2.5 h-2.5 rounded-full transition-all duration-300',
                  p.running ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-600'
                ]"
              ></div>

              <div class="flex flex-col overflow-hidden">
                <div class="flex items-center gap-2">
                  <span
                    class="font-mono text-base font-bold text-gray-200 truncate"
                    :title="p.name"
                    >{{ p.name }}</span
                  >

                  <span
                    :class="[
                      'text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase',
                      getRunnerBadgeStyle(p.runner)
                    ]"
                  >
                    {{ p.runner }}
                  </span>
                </div>

                <span class="text-[10px] text-gray-500 truncate" :title="p.path">{{
                  p.path.split(/[\\/]/).slice(-2).join('/')
                }}</span>
              </div>

              <span
                v-if="hiddenProjectNames.has(p.name)"
                class="text-[10px] bg-yellow-900/30 text-yellow-500 px-1.5 py-0.5 rounded border border-yellow-800/50"
                >HIDDEN</span
              >
            </div>

            <div class="flex items-center gap-2">
              <button
                @click="toggleHideProject(p)"
                class="text-gray-500 hover:text-red-400 p-1.5 rounded transition hover:bg-gray-700"
              >
                <svg
                  v-if="!hiddenProjectNames.has(p.name)"
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M3 6h18"></path>
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                </svg>
                <svg
                  v-else
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </div>

          <div
            class="px-4 py-3 bg-[#111827] flex flex-wrap gap-2 items-center border-b border-gray-700/50 min-h-[50px]"
          >
            <button
              v-for="(cmd, key) in p.scripts"
              :key="key"
              @click="runScript(p, key)"
              :disabled="p.running"
              class="px-3 py-1 text-xs font-bold text-white transition bg-blue-600 border border-transparent rounded shadow-sm hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed hover:border-blue-400"
            >
              {{ key }}
            </button>

            <div class="flex-1"></div>

            <button
              @click="stopScript(p)"
              title="强制杀死进程"
              class="flex items-center gap-1 px-3 py-1 text-xs font-bold text-red-400 transition border rounded bg-red-900/30 hover:bg-red-600 hover:text-white border-red-800/50"
            >
              <span>💀</span> KILL
            </button>
          </div>

          <TerminalView
            :id="p.name"
            :logs="projectLogs[p.name] || []"
            @open-file="handleOpenFile"
          />
        </div>
      </div>
    </div>
  </div>
</template>
