<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { socket } from '../../utils/socket'
import { useAiConfig } from '../../utils/useAiConfig'
import { defaultDateRange, groupCommits, toggleCommitSelection, type WeeklyReportCommit } from '../../utils/weeklyReport'

type Repository = { id: string; name: string; path: string; enabled: boolean }
type Identity = { name: string; emails: string[] }
type Activity = { commits: WeeklyReportCommit[]; errors: Array<{ repositoryId: string; message: string }> }

const repositories = ref<Repository[]>([])
const identities = ref<Identity[]>([])
const selectedIdentities = ref<string[]>([])
const activity = ref<Activity>({ commits: [], errors: [] })
const selectedCommits = ref<Set<string>>(new Set())
const reportMarkdown = ref('')
const history = ref<Array<{ id: string; createdAt: string; markdown: string }>>([])
const rootPath = ref('')
const loading = ref(false)
const generating = ref(false)
const { getSceneConfig } = useAiConfig()
const dates = ref(defaultDateRange())

const grouped = computed(() => groupCommits(activity.value.commits))
const selectedCount = computed(() => selectedCommits.value.size)

const emitRequest = <T>(event: string, payload: unknown = {}) => new Promise<T>((resolve, reject) => {
  socket.emit(event, payload, (response: any) => {
    if (response?.success === false) reject(new Error(response.error?.message || response.error || '操作失败'))
    else resolve(response?.data as T)
  })
})

const loadRepositories = async () => {
  repositories.value = await emitRequest<Repository[]>('weekly-report:repositories:list')
  const result = await emitRequest<{ selected: Identity[]; candidates: Identity[] }>('weekly-report:identities:list')
  identities.value = result.candidates
  selectedIdentities.value = result.selected.map((identity) => identity.name)
  history.value = await emitRequest<typeof history.value>('weekly-report:history:list')
}

const importRoot = async () => {
  if (!rootPath.value.trim()) return
  try {
    await emitRequest('weekly-report:repositories:import-root', { rootPath: rootPath.value.trim() })
    rootPath.value = ''
    await loadRepositories()
  } catch (error: any) { window.$toast?.warning?.(error.message) }
}

const toggleRepository = async (repository: Repository) => {
  try {
    await emitRequest('weekly-report:repositories:set-enabled', { id: repository.id, enabled: !repository.enabled })
    repository.enabled = !repository.enabled
  } catch (error: any) { window.$toast?.warning?.(error.message) }
}

const saveIdentities = async () => {
  const selected = identities.value.filter((identity) => selectedIdentities.value.includes(identity.name))
  await emitRequest('weekly-report:identities:save', { identities: selected })
}

const collect = async () => {
  loading.value = true
  try {
    activity.value = await emitRequest<Activity>('weekly-report:activity:collect', dates.value)
    selectedCommits.value = new Set(activity.value.commits.map((commit) => commit.hash))
  } catch (error: any) { window.$toast?.warning?.(error.message) }
  finally { loading.value = false }
}

const toggleCommit = (hash: string) => { selectedCommits.value = toggleCommitSelection(selectedCommits.value, hash) }

const generate = async () => {
  generating.value = true
  try {
    await saveIdentities()
    const selected = activity.value.commits.filter((commit) => selectedCommits.value.has(commit.hash))
    const context = await emitRequest('weekly-report:generate-context', { activity: { ...activity.value, commits: selected } })
    const config = getSceneConfig('weeklyReport')
    const result = await emitRequest<string>('weekly-report:generate', {
      context,
      configId: config?.id,
      systemPrompt: '你是周报助手。只根据 Git 活动事实生成简洁中文 Markdown 周报，按项目归类，避免夸大和重复。'
    })
    reportMarkdown.value = result
  } catch (error: any) { window.$toast?.error?.(error.message) }
  finally { generating.value = false }
}

const copyReport = async () => {
  if (!reportMarkdown.value) return
  await navigator.clipboard?.writeText(reportMarkdown.value)
  window.$toast?.success?.('周报已复制')
}

const saveReport = async () => {
  if (!reportMarkdown.value) return
  await emitRequest('weekly-report:history:save', { report: { ...dates.value, markdown: reportMarkdown.value } })
  history.value = await emitRequest<typeof history.value>('weekly-report:history:list')
}

const loadHistory = async (id: string) => {
  const report = await emitRequest<{ markdown: string }>('weekly-report:history:get', { id })
  if (report) reportMarkdown.value = report.markdown
}

onMounted(() => { loadRepositories().catch((error) => window.$toast?.warning?.(error.message)) })
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white">
    <header class="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-gray-700 bg-gray-800 p-4">
      <div>
        <h1 class="text-xl font-bold text-blue-400">Weekly Report</h1>
        <p class="text-xs text-gray-400">按 Git 作者名汇总本人的跨仓库工作</p>
      </div>
      <button class="rounded bg-gray-700 px-3 py-2 text-sm hover:bg-gray-600" @click="$router.push('/dashboard')">返回项目</button>
    </header>
    <main class="grid gap-4 p-4 lg:grid-cols-[320px_1fr]">
      <aside class="space-y-4">
        <section class="rounded border border-gray-700 bg-gray-800 p-4">
          <h2 class="mb-3 font-semibold">Git 仓库</h2>
          <div class="mb-3 flex gap-2">
            <input v-model="rootPath" class="min-w-0 flex-1 rounded border border-gray-600 bg-gray-900 px-2 py-2 text-xs" placeholder="扫描根目录" @keyup.enter="importRoot" />
            <button class="rounded bg-blue-600 px-3 text-xs hover:bg-blue-500" @click="importRoot">导入</button>
          </div>
          <div v-for="repository in repositories" :key="repository.id" class="flex items-center gap-2 border-t border-gray-700 py-2 text-sm">
            <input type="checkbox" :checked="repository.enabled" @change="toggleRepository(repository)" />
            <span class="truncate" :title="repository.path">{{ repository.name }}</span>
          </div>
        </section>
        <section class="rounded border border-gray-700 bg-gray-800 p-4">
          <h2 class="mb-3 font-semibold">本人作者名</h2>
          <label v-for="identity in identities" :key="identity.name" class="mb-2 flex items-start gap-2 text-sm">
            <input v-model="selectedIdentities" type="checkbox" :value="identity.name" />
            <span><span class="block">{{ identity.name }}</span><span class="text-[10px] text-gray-500">{{ identity.emails.join(', ') }}</span></span>
          </label>
        </section>
      </aside>
      <section class="space-y-4">
        <div class="flex flex-wrap items-end gap-3 rounded border border-gray-700 bg-gray-800 p-4">
          <label class="text-xs text-gray-400">开始日期<input v-model="dates.startDate" type="date" class="mt-1 block rounded border border-gray-600 bg-gray-900 px-2 py-2 text-sm text-white" /></label>
          <label class="text-xs text-gray-400">结束日期<input v-model="dates.endDate" type="date" class="mt-1 block rounded border border-gray-600 bg-gray-900 px-2 py-2 text-sm text-white" /></label>
          <button class="rounded bg-gray-700 px-4 py-2 text-sm hover:bg-gray-600 disabled:opacity-50" :disabled="loading" @click="collect">{{ loading ? '采集中…' : '刷新活动' }}</button>
          <button class="rounded bg-blue-600 px-4 py-2 text-sm hover:bg-blue-500 disabled:opacity-50" :disabled="generating || !activity.commits.length" @click="generate">{{ generating ? '生成中…' : `生成周报 (${selectedCount})` }}</button>
        </div>
        <div v-if="activity.errors.length" class="rounded border border-yellow-700/50 bg-yellow-900/20 p-3 text-xs text-yellow-300">部分仓库采集失败：{{ activity.errors.map((error) => error.message).join('；') }}</div>
        <div class="grid gap-3 md:grid-cols-2">
          <article v-for="(commits, name) in grouped" :key="name" class="rounded border border-gray-700 bg-gray-800 p-4">
            <h2 class="mb-2 font-semibold text-blue-300">{{ name }}</h2>
            <label v-for="commit in commits" :key="commit.hash" class="mb-2 flex gap-2 text-sm">
              <input type="checkbox" :checked="selectedCommits.has(commit.hash)" @change="toggleCommit(commit.hash)" />
              <span><span class="block">{{ commit.subject }}</span><span class="text-[10px] text-gray-500">{{ commit.hash }} · {{ commit.authoredAt }}</span></span>
            </label>
          </article>
        </div>
        <section class="rounded border border-gray-700 bg-gray-800 p-4">
          <div class="mb-3 flex items-center justify-between"><h2 class="font-semibold">周报 Markdown</h2><div class="flex gap-2"><button class="rounded bg-gray-700 px-3 py-1 text-xs" @click="copyReport">复制</button><button class="rounded bg-gray-700 px-3 py-1 text-xs" @click="saveReport">保存历史</button></div></div>
          <textarea v-model="reportMarkdown" class="min-h-[360px] w-full rounded border border-gray-600 bg-gray-900 p-3 font-mono text-sm" placeholder="生成后可直接编辑…" />
        </section>
        <select v-if="history.length" class="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-xs" @change="loadHistory(($event.target as HTMLSelectElement).value)"><option value="">加载历史周报</option><option v-for="report in history" :key="report.id" :value="report.id">{{ report.createdAt }}</option></select>
      </section>
    </main>
  </div>
</template>
