import { tool } from '@langchain/core/tools'
import * as z from 'zod'

// 存储最近一次命令执行结果（供 get_last_output 使用）
let lastExecutionResult: CommandExecutionResult | null = null

export interface CommandExecutionResult {
  command: string
  stdout: string
  stderr: string
  exitCode: number
  duration: number
  timestamp: number
}

export function setLastExecutionResult(result: CommandExecutionResult): void {
  lastExecutionResult = result
}

export function getLastExecutionResult(): CommandExecutionResult | null {
  return lastExecutionResult
}

export const listCommands = tool(
  async () => {
    return JSON.stringify([
      {
        name: 'get',
        syntax: 'get <key> [options]',
        description: '查询指定 key 的值',
        options: [
          { name: '--prefix', description: '前缀查询' },
          { name: '--keys-only', description: '只返回 key 列表' }
        ]
      },
      {
        name: 'put',
        syntax: 'put <key> <value>',
        description: '存储 key-value'
      },
      {
        name: 'del',
        syntax: 'del <key>',
        description: '删除指定 key'
      },
      {
        name: 'member list',
        syntax: 'member list',
        description: '查询集群成员列表'
      },
      {
        name: '-h',
        syntax: '-h',
        description:'查看帮助文档'
      }
    ], null, 2)
  },
  {
    name: 'list_commands',
    description: '列出所有可用的 craftctl/etcdctl 命令及其用法或者帮助文档',
    schema: z.object({})
  }
)

export const validateKeyFormat = tool(
  ({ key }) => {
    const validKeyPattern = /^\/[a-zA-Z0-9_\-.\/]*$/
    if (!key.startsWith('/')) {
      return `无效: key 必须以 "/" 开头。当前值: "${key}"`
    }
    if (!validKeyPattern.test(key)) {
      return `无效: key 包含非法字符。只允许字母、数字、下划线、连字符、点号和斜杠。当前值: "${key}"`
    }
    return `有效: "${key}" 格式正确`
  },
  {
    name: 'validate_key_format',
    description: '验证 KV 存储的 key 格式是否正确。key 必须以 "/" 开头，只能包含字母、数字、下划线、连字符、点号和斜杠',
    schema: z.object({
      key: z.string().describe('要验证的 key')
    })
  }
)

// 定义工具：生成最终命令
export const generateCommand = tool(
  async ({ command, description, safetyLevel, warnings }: {
    command: string
    description: string
    safetyLevel: 'safe' | 'warning' | 'dangerous'
    warnings: string[]
  }) => {
    // 返回结构化结果，供前端稳定渲染命令卡片
    return JSON.stringify({
      command,
      description,
      safetyLevel,
      warnings: warnings || []
    })
  },
  {
    name: 'generate_command',
    description: '生成最终的 craftctl/etcdctl 命令。当确定用户的意图后，使用此工具输出命令。',
    schema: z.object({
      command: z.string().describe('完整的 craftctl/etcdctl 命令（包含工具路径和 endpoint）'),
      description: z.string().describe('命令的作用说明'),
      safetyLevel: z.enum(['safe', 'warning', 'dangerous']).describe('安全级别'),
      warnings: z.array(z.string()).describe('风险提示列表')
    })
  }
)

// 新增 Tool：获取最近一次命令执行结果
export const getLastOutput = tool(
  async () => {
    const result = getLastExecutionResult()
    
    if (!result) {
      return '暂无命令执行记录。请先执行一个命令后再尝试分析。'
    }
    
    return JSON.stringify({
      command: result.command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      duration: result.duration,
      timestamp: new Date(result.timestamp).toISOString(),
      success: result.exitCode === 0
    }, null, 2)
  },
  {
    name: 'get_last_output',
    description: '获取最近一次命令执行的输出结果（stdout、stderr、exitCode 等）。当用户要求分析输出、分析错误或总结结果时使用。',
    schema: z.object({})
  }
)
