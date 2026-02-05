<script setup>
import { onMounted, ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

const props = defineProps({
  id: String,
  logs: { type: Array, default: () => [] }
});

const emit = defineEmits(['open-file']);

const terminalContainer = ref(null);
const copySuccess = ref(false); // 控制复制成功的提示状态

let term = null;
let fitAddon = null;
let writeIndex = 0;

// --- 📋 核心功能：一键复制日志 ---
const copyLogs = async () => {
  try {
    // 直接从原始数据复制，比去终端里选文本更精准、更干净
    const text = props.logs.join('');
    await navigator.clipboard.writeText(text);
    
    // 显示 2秒 的成功提示
    copySuccess.value = true;
    setTimeout(() => copySuccess.value = false, 2000);
  } catch (err) {
    console.error('复制失败', err);
    alert('复制失败，请手动选择复制');
  }
};

const clearLogs = () => {
  term?.clear();
  writeIndex = props.logs.length; // 标记为已读，但不删原始数据，防止逻辑错乱
};

const initTerminal = () => {
  if (term) return;

  term = new Terminal({
    theme: { 
      background: '#0f172a', 
      foreground: '#cbd5e1', 
      cursor: '#38bdf8', 
      selectionBackground: '#3b82f64d' 
    },
    fontSize: 13,
    lineHeight: 1.5, // 稍微加大行高，更容易阅读
    fontFamily: 'Consolas, "Courier New", monospace',
    convertEol: true,
    rows: 16,
    cursorBlink: true,
    disableStdin: true, // 禁止用户输入
    rightClickSelectsWord: true, // 允许右键选中单词
  });
  
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  // --- 🔗 核心功能：链接点击处理 ---
  
  // 1. 正则：同时匹配 URL 和 Windows 绝对路径
  // 组1: http/https 链接
  // 组2: Windows 路径 (D:\xxx 或 C:/xxx) 后面可选跟行号
  const linkRegex = /(https?:\/\/[^\s"'()]+)|([a-zA-Z]:[\\/][\w.\-\\/ ]+(:[\d]+){0,2})/;

  const linkAddon = new WebLinksAddon(
    (event, uri) => {
      event.preventDefault(); // 阻止默认行为
      
      // A. 如果是 http 开头，用浏览器新标签页打开
      if (uri.startsWith('http')) {
        window.open(uri, '_blank');
      } 
      // B. 否则认为是本地文件，通知后端打开
      else {
        // 去掉可能包含的行号再发给后端，或者直接发给后端处理
        console.log('🔗 请求打开本地文件:', uri);
        emit('open-file', uri);
      }
    },
    {
      urlRegex: linkRegex,
      // 这里的 tooltip 可以告诉用户怎么操作
      tooltipCallback: (e, uri) => {
          // 这里可以返回字符串显示在 tooltip，或者返回 true 使用默认
          return true; 
      }
    }
  );
  
  term.loadAddon(linkAddon);
  term.open(terminalContainer.value);
  
  setTimeout(() => fitAddon.fit(), 50);
  flushLogs();
};

const flushLogs = () => {
  if (!term || !props.logs) return;
  if (props.logs.length < writeIndex) {
    term.clear();
    writeIndex = 0;
  }
  const newLogs = props.logs.slice(writeIndex);
  if (newLogs.length > 0) {
    newLogs.forEach(line => term.write(line));
    writeIndex = props.logs.length;
  }
};

onMounted(() => { nextTick(() => initTerminal()); });
watch(() => props.logs, () => flushLogs(), { deep: true, flush: 'sync' });

const resizeObserver = new ResizeObserver(() => fitAddon?.fit());
onMounted(() => { if (terminalContainer.value) resizeObserver.observe(terminalContainer.value); });
onBeforeUnmount(() => { term?.dispose(); resizeObserver.disconnect(); });
</script>

<template>
  <div class="w-full h-[300px] bg-[#0f172a] rounded-b-lg p-2 overflow-hidden border-t border-gray-700 relative group">
    
    <div class="absolute z-10 flex gap-2 transition-opacity duration-200 opacity-0 top-2 right-4 group-hover:opacity-100">
      
      <span v-if="copySuccess" class="px-2 py-1 text-xs text-green-400 rounded bg-black/50 fade-in">
        ✅ 已复制
      </span>

      <button @click="copyLogs" 
              class="p-1.5 bg-gray-700/80 hover:bg-blue-600 text-gray-300 hover:text-white rounded text-xs backdrop-blur-sm border border-gray-600 transition" 
              title="复制所有日志">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      </button>

      <button @click="clearLogs" 
              class="p-1.5 bg-gray-700/80 hover:bg-red-600 text-gray-300 hover:text-white rounded text-xs backdrop-blur-sm border border-gray-600 transition" 
              title="清空当前屏幕">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
      </button>
    </div>

    <div ref="terminalContainer" class="w-full h-full" style="text-align: left !important;"></div>
  </div>
</template>

<style scoped>
.fade-in {
  animation: fadeIn 0.3s ease-in-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>