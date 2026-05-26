// 全局命令执行历史存储（供 AI 分析使用）
export interface CommandExecutionResult {
  command: string
  stdout: string
  stderr: string
  exitCode: number
  duration: number
  timestamp: number
}

let lastExecutionResult: CommandExecutionResult | null = null

export function setLastExecutionResult(result: CommandExecutionResult): void {
  lastExecutionResult = result
  console.log('[CommandHistory] 已保存执行结果:', { command: result.command.substring(0, 50), exitCode: result.exitCode })
}

export function getLastExecutionResult(): CommandExecutionResult | null {
  return lastExecutionResult
}

export function clearLastExecutionResult(): void {
  lastExecutionResult = null
}
