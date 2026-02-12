<template>
  <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
    <div class="w-full max-w-3xl bg-[#1e1e1e] border border-gray-700 rounded-lg shadow-2xl overflow-hidden flex flex-col h-[500px]">
      
      <div class="flex items-center justify-between p-4 border-b border-gray-700 bg-[#252526]">
        <h3 class="flex items-center gap-2 text-lg font-bold text-white">
          <span>🤖</span> AI 模型管理
        </h3>
        <button @click="$emit('close')" class="px-2 text-gray-400 hover:text-white">✕</button>
      </div>

      <div class="flex flex-1 overflow-hidden">
        
        <div class="w-64 border-r border-gray-700 bg-[#18181b] flex flex-col">
          <div class="p-3 text-xs font-bold tracking-wider text-gray-500 uppercase">已保存的模型</div>
          
          <div class="flex-1 px-2 space-y-1 overflow-y-auto">
            <div 
              v-for="config in configList" 
              :key="config.id"
              @click="handleSelect(config)"
              class="flex items-center justify-between px-3 py-3 transition rounded cursor-pointer select-none"
              :class="currentEditId === config.id ? 'bg-[#37373d] text-white' : 'text-gray-400 hover:bg-[#2a2a2d]'"
            >
              <div class="flex flex-col overflow-hidden">
                <span class="text-sm font-medium truncate">{{ config.name }}</span>
                <span class="text-[10px] text-gray-500 truncate">{{ config.model }}</span>
              </div>

              <div 
                v-if="activeId === config.id"
                class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"
                title="当前正在使用"
              ></div>
            </div>
          </div>

          <div class="p-3 border-t border-gray-700">
            <button 
              @click="handleCreateNew" 
              class="flex items-center justify-center w-full gap-2 px-4 py-2 text-sm text-blue-400 transition border border-gray-600 border-dashed rounded hover:bg-blue-500/10 hover:border-blue-500"
            >
              <span>+</span> 添加新模型
            </button>
          </div>
        </div>

        <div class="flex-1 bg-[#1e1e1e] flex flex-col">
          
          <div v-if="formData" class="flex-1 p-6 overflow-y-auto">
            <div class="flex items-center justify-between pb-2 mb-6 border-b border-gray-700">
              <h4 class="text-base font-bold text-white">
                {{ isCreating ? '🆕 新增配置' : '✏️ 编辑配置' }}
              </h4>
              <button 
                v-if="!isCreating && activeId !== formData.id"
                @click="setActive(formData.id)"
                class="px-3 py-1 text-xs text-green-400 transition border border-green-800 rounded bg-green-900/30 hover:bg-green-800"
              >
                设为当前使用
              </button>
              <span v-else-if="activeId === formData.id" class="px-2 py-1 text-xs font-bold text-green-500 border rounded border-green-500/30 bg-green-500/10">
                ✅ 正在使用中
              </span>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block mb-1 text-xs text-gray-500">显示名称 (别名)</label>
                <input v-model="formData.name" type="text" placeholder="例如：DeepSeek V3" class="w-full bg-[#252526] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none transition">
              </div>

              <div>
                <label class="block mb-1 text-xs text-gray-500">API 协议</label>
                <select v-model="formData.provider" class="w-full bg-[#252526] border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none transition">
                  <option value="openai">OpenAI 兼容 (DeepSeek / GPT / Codex 等)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>

              <div>
                <label class="block mb-1 text-xs text-gray-500">Base URL (API 地址)</label>
                <input v-model="formData.baseURL" type="text" placeholder="https://api.deepseek.com" class="w-full bg-[#252526] border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none transition">
              </div>

              <div>
                <label class="block mb-1 text-xs text-gray-500">API Key</label>
                <input v-model="formData.apiKey" type="password" placeholder="API Key..." class="w-full bg-[#252526] border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none transition">
              </div>

              <div>
                <label class="block mb-1 text-xs text-gray-500">Model (模型名)</label>
                <input v-model="formData.model" type="text" placeholder="deepseek-chat" class="w-full bg-[#252526] border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none transition">
                <p class="text-[10px] text-yellow-600 mt-1">⚠️ 模型名称以供应商实际提供的为准，可能与官方命名不同</p>
                <p class="text-[10px] text-gray-500 mt-1">
                  常用:
                  <span class="text-gray-300 cursor-pointer hover:text-blue-400" @click="formData.model='deepseek-chat'">deepseek-chat</span>,
                  <span class="text-gray-300 cursor-pointer hover:text-blue-400" @click="formData.model='gpt-4o'">gpt-4o</span>,
                  <span class="text-gray-300 cursor-pointer hover:text-blue-400" @click="formData.model='claude-sonnet-4-20250514'">claude-sonnet-4</span>
                </p>
              </div>
            </div>
          </div>

          <div v-if="formData" class="p-4 border-t border-gray-700 bg-[#252526] flex justify-between items-center">
            <button 
              v-if="!isCreating"
              @click="handleDelete"
              class="text-xs text-red-400 underline hover:text-red-300"
            >
              删除配置
            </button>
            <div v-else></div> <div class="flex gap-3">
              <button 
                @click="formData = null; currentEditId = null" 
                class="px-4 py-2 text-xs text-gray-300 transition hover:text-white"
              >
                取消
              </button>
              <button 
                @click="save" 
                class="px-5 py-2 text-xs font-bold text-white transition bg-blue-600 rounded shadow-lg hover:bg-blue-500 shadow-blue-900/50"
              >
                保存配置
              </button>
            </div>
          </div>

          <div v-else class="flex flex-col items-center justify-center h-full text-gray-600">
            <div class="mb-2 text-4xl grayscale opacity-30">⚙️</div>
            <p class="text-sm">请在左侧选择模型，或点击添加</p>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useAiConfig } from '../utils/useAiConfig';

const props = defineProps({ visible: Boolean });
const emit = defineEmits(['close']);

const { configList, activeId, addConfig, updateConfig, removeConfig } = useAiConfig();

const currentEditId = ref(null);
const formData = ref(null);
const isCreating = ref(false);

// 点击左侧列表项
const handleSelect = (config) => {
  isCreating.value = false;
  currentEditId.value = config.id;
  // 深拷贝，防止修改表单时直接变动列表显示（只有保存才变）
  formData.value = { ...config };
};

// 点击新增按钮
const handleCreateNew = () => {
  isCreating.value = true;
  currentEditId.value = 'NEW_TEMP_ID'; // 给个临时 ID 让 UI 高亮
  formData.value = {
    name: 'New Model',
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-3.5-turbo'
  };
};

// 设为激活
const setActive = (id) => {
  activeId.value = id;
};

// 保存逻辑
const save = () => {
  if (!formData.value.name) return $toast.warning('名称不能为空');
  if (!formData.value.baseURL) return $toast.warning('Base URL 不能为空');
  if (!formData.value.apiKey) return $toast.warning('API Key 不能为空');

  if (isCreating.value) {
    // 新增模式：push 到数组
    addConfig(formData.value);
    // 自动选中刚才新增的
    const last = configList.value[configList.value.length - 1];
    handleSelect(last);
  } else {
    // 编辑模式：更新数组
    updateConfig(formData.value.id, formData.value);
    // 刷新一下表单状态
    const updated = configList.value.find(c => c.id === formData.value.id);
    handleSelect(updated);
  }
  
  $toast.success('保存成功')
};

const handleDelete = async () => {
  const ok = await window.$confirm('确定要删除吗？', '警告', {
    type: 'error',
    confirmText: '狠狠地删'
  });
  if (ok) {
    removeConfig(formData.value.id);
    formData.value = null;
    currentEditId.value = null;
  }
};

// 每次打开弹窗，默认选中当前正在使用的那个
watch(() => props.visible, (val) => {
  if (val) {
    const active = configList.value.find(c => c.id === activeId.value);
    if (active) {
      handleSelect(active);
    } else if (configList.value.length > 0) {
      handleSelect(configList.value[0]);
    } else {
      handleCreateNew();
    }
  }
});
</script>