export type WeeklyReportCommit = {
  hash: string
  repositoryId: string
  repositoryName?: string
  authorName: string
  authoredAt: string
  subject: string
  files?: string[]
  insertions?: number
  deletions?: number
}

export const toDateInput = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const defaultDateRange = (now = new Date()) => {
  const end = new Date(now)
  const day = end.getDay() || 7
  const start = new Date(end)
  start.setDate(end.getDate() - day + 1)
  return { startDate: toDateInput(start), endDate: toDateInput(end) }
}

export const toggleCommitSelection = (selected: Set<string>, hash: string) => {
  const next = new Set(selected)
  if (next.has(hash)) next.delete(hash)
  else next.add(hash)
  return next
}

export const groupCommits = (commits: WeeklyReportCommit[]) => {
  const groups: Record<string, WeeklyReportCommit[]> = {}
  commits.forEach((commit) => {
    const name = commit.repositoryName || commit.repositoryId
    groups[name] = groups[name] || []
    groups[name].push(commit)
  })
  return groups
}
