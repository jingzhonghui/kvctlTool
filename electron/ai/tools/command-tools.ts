import { tool } from '@langchain/core/tools'
import * as z from 'zod'

export const AVAILABLE_COMMANDS = [
  {
    name: 'get',
    syntax: 'get <key> [options]',
    description: '查询指定 key 的值',
    options: [
      { name: '--prefix', description: '前缀查询，匹配所有以指定字符串开头的 key' },
      { name: '--keys-only', description: '只返回 key 列表，不返回 value' }
    ]
  },
  {
    name: 'put',
    syntax: 'put <key> <value>',
    description: '存储 key-value',
    options: []
  },
  {
    name: 'del',
    syntax: 'del <key>',
    description: '删除指定 key',
    options: []
  },
  {
    name: 'member list',
    syntax: 'member list',
    description: '查询集群成员列表',
    options: []
  }
]

export const listCommands = tool(
  () => {
    return JSON.stringify(AVAILABLE_COMMANDS, null, 2)
  },
  {
    name: 'list_commands',
    description: '列出所有可用的 craftctl 命令及其用法，包括命令名称、语法、描述和可用选项',
    schema: z.object({})
  }
)

export const validateKeyFormat = tool(
  ({ key }) => {
    const validKeyPattern = /^\/[a-zA-Z0-9_\-./]*$/
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
