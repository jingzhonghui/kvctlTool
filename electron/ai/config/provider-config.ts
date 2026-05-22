import Store from 'electron-store'

const store = new Store()

export type AIProvider = 'openai' | 'openai-compatible'

export interface AIProviderConfig {
  provider: AIProvider
  apiKey: string
  baseUrl?: string
  model: string
  temperature: number
  maxTokens: number
  enabled: boolean
}

export const DEFAULT_AI_CONFIG: AIProviderConfig = {
  provider: 'openai',
  apiKey: '',
  baseUrl: '',
  model: 'gpt-4',
  temperature: 0.3,
  maxTokens: 2048,
  enabled: false
}

// 配置存储 key
const AI_CONFIG_KEY = 'aiConfig'

/**
 * 获取 AI 配置
 */
export function getAIConfig(): AIProviderConfig {
  const config = store.get(AI_CONFIG_KEY, DEFAULT_AI_CONFIG) as AIProviderConfig
  return { ...DEFAULT_AI_CONFIG, ...config }
}

/**
 * 保存 AI 配置
 */
export function setAIConfig(config: Partial<AIProviderConfig>): void {
  const current = getAIConfig()
  const newConfig = { ...current, ...config }
  store.set(AI_CONFIG_KEY, newConfig)
}

/**
 * 重置 AI 配置为默认值
 */
export function resetAIConfig(): void {
  store.set(AI_CONFIG_KEY, DEFAULT_AI_CONFIG)
}

/**
 * 验证配置是否有效
 */
export function isAIConfigValid(config?: AIProviderConfig): boolean {
  const cfg = config || getAIConfig()
  return !!cfg.enabled && 
         cfg.apiKey.length > 0 && 
         cfg.model.length > 0 &&
         (cfg.provider !== 'openai-compatible' || (!!cfg.baseUrl && cfg.baseUrl.length > 0))
}

/**
 * 获取推荐模型列表
 */
export function getRecommendedModels(provider: AIProvider): string[] {
  switch (provider) {
    case 'openai':
      return [
        'gpt-4',
        'gpt-4-turbo',
        'gpt-4o',
        'gpt-3.5-turbo'
      ]
    case 'openai-compatible':
      return [
        '自定义模型名称'
      ]
    default:
      return []
  }
}
