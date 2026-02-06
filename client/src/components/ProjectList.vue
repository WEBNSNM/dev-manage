<template>
  <div class="project-list-container">
    <div v-if="projects.length === 0" class="flex flex-col items-center justify-center h-64 text-gray-500">
      <div class="mb-4 text-4xl opacity-50">📂</div>
      <p>暂无项目</p>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="p in projects"
        :key="p.path"
        class="relative flex flex-col transition bg-gray-800 border border-gray-700 rounded-lg shadow-xl group hover:border-blue-500/30"
      >
        <div class="flex items-center justify-between p-3 pl-4 bg-gray-800 border-b border-gray-700 rounded-t-lg">
          <div class="flex items-center gap-3 overflow-hidden">
            <div
              :class="[
                'w-2.5 h-2.5 rounded-full transition-all duration-300',
                hasRunningScripts(p) ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-600'
              ]"
            ></div>

            <div class="flex flex-col overflow-hidden">
              <div class="flex items-center gap-2">
                <span class="font-mono text-base font-bold text-gray-200 truncate" :title="p.name">
                  {{ p.name }}
                </span>
                <span :class="['text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase', getRunnerBadgeStyle(p.runner)]">
                  {{ p.runner }}
                </span>
              </div>
              
              <div class="flex items-center min-w-0 gap-1 text-gray-500">
                <span class="text-[10px] truncate hover:text-gray-300 transition">
                  {{ p.path.split(/[\\/]/).slice(-2).join('/') }}
                </span>
                <button
                  @click.stop="$emit('open-folder', p.path)"
                  title="在资源管理器中打开"
                  class="p-1 text-gray-500 transition rounded hover:bg-gray-700 hover:text-blue-400 shrink-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path><path d="M2 10h20"></path></svg>
                </button>
              </div>
            </div>

            <span v-if="isHidden(p.name)" class="text-[10px] bg-yellow-900/30 text-yellow-500 px-1.5 py-0.5 rounded border border-yellow-800/50">
              HIDDEN
            </span>
          </div>

          <button
            @click="$emit('toggle-hide', p)"
             :title="!isHidden(p.name) ? '隐藏' : '退出隐藏'"
            class="text-gray-500 hover:text-red-400 p-1.5 rounded transition hover:bg-gray-700"
          >
            <svg v-if="!isHidden(p.name)" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
        </div>

        <div class="px-4 py-3 bg-[#111827] flex flex-wrap gap-2 items-center border-b border-gray-700/50 min-h-[50px]">
          <button
            v-for="(cmd, key) in p.scripts"
            :key="key"
            @click="$emit('run', p, key)"
            :disabled="p.runningScripts?.[key]"
            :class="[
              'px-3 py-1 text-xs font-bold rounded transition text-white shadow-sm border border-transparent',
              p.runningScripts?.[key]
                ? 'bg-green-600 cursor-default opacity-80'
                : 'bg-blue-600 hover:bg-blue-500 hover:border-blue-400'
            ]"
          >
            <span v-if="p.runningScripts?.[key]" class="flex items-center gap-1">
              <span class="animate-pulse">●</span> {{ key }}
            </span>
            <span v-else>{{ key }}</span>
          </button>

          <div class="flex-1"></div>

          <button
            @click="$emit('stop', p)"
            title="强制杀死进程"
            class="flex items-center gap-1 px-3 py-1 text-xs font-bold text-red-400 transition border rounded bg-red-900/30 hover:bg-red-600 hover:text-white border-red-800/50"
          >
            <span>💀</span> KILL
          </button>
        </div>

        <div v-if="stats[p.path]" class="px-4 py-2 border-b bg-gray-900/80 border-gray-700/50">
          <div class="flex items-center mb-1 text-xs">
            <span class="w-8 text-gray-400">CPU</span>
            <div class="flex-1 h-1.5 mx-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                class="h-full transition-all duration-300 bg-red-500" 
                :style="{ width: Math.min(stats[p.path].cpu, 100) + '%' }"
              ></div>
            </div>
            <span class="w-12 font-mono text-right text-red-400">{{ stats[p.path].cpu }}%</span>
          </div>
          <div class="flex items-center text-xs">
            <span class="w-8 text-gray-400">MEM</span>
            <div class="flex-1 h-1.5 mx-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                class="h-full transition-all duration-300 bg-blue-500" 
                :style="{ width: calcMemPercent(stats[p.path].memory) + '%' }"
              ></div>
            </div>
            <span class="w-12 font-mono text-right text-blue-400">{{ formatBytes(stats[p.path].memory) }}</span>
          </div>
        </div>

        <TerminalView
          :id="p.name"
          :logs="logs[p.name] || []"
          @open-file="(uri) => $emit('open-file', uri)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import TerminalView from './TerminalView.vue'

// 接收父组件传来的“真数据”
const props = defineProps({
  projects: { type: Array, default: () => [] },
  stats: { type: Object, default: () => ({}) }, // 监控数据
  logs: { type: Object, default: () => ({}) },  // 日志数据
  hiddenSet: { type: Set, default: () => new Set() }
})

const emit = defineEmits(['run', 'stop', 'open-folder', 'open-file', 'toggle-hide'])

// 辅助函数
const hasRunningScripts = (p) => {
  return p.runningScripts && Object.values(p.runningScripts).some(Boolean)
}

const isHidden = (name) => {
  return props.hiddenSet.has(name)
}

const getRunnerBadgeStyle = (runner) => {
  switch (runner) {
    case 'pnpm': return 'bg-orange-500/20 text-orange-400 border-orange-500/50'
    case 'yarn': return 'bg-blue-500/20 text-blue-400 border-blue-500/50'
    case 'bun': return 'bg-pink-500/20 text-pink-400 border-pink-500/50'
    default: return 'bg-red-500/20 text-red-400 border-red-500/50'
  }
}

// 格式化内存
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const calcMemPercent = (bytes) => {
  const limit = 500 * 1024 * 1024 // 500MB 基准
  return Math.min((bytes / limit) * 100, 100)
}
</script>