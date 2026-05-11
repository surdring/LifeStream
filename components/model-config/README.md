# ModelConfig 模型配置模块

通用的 AI 模型配置组件，支持多提供商切换、模型选择、API Key 管理和服务器默认配置。可从任意 React 应用中直接引入使用。

## 文件结构

```
model-config/
├── types.ts           # 类型定义
├── useModelConfig.ts  # 状态管理 Hook
├── ModelConfig.tsx    # UI 组件（预组合 + 子组件）
├── index.ts           # Barrel export
└── README.md          # 本文档
```

## 快速开始

### 方式一：使用预组合组件

```tsx
import { ModelConfig, useModelConfig } from './components/model-config';

function MyApp() {
  const modelConfig = useModelConfig();

  return (
    <>
      {/* 可折叠面板（侧边栏场景） */}
      <ModelConfig config={modelConfig} />

      {/* 弹窗内容（无折叠头，撑满父容器） */}
      <ModelConfig config={modelConfig} variant="modal-content" />

      {/* 精简模式（仅提供商+模型） */}
      <ModelConfig config={modelConfig} variant="compact" />
    </>
  );
}
```

### 方式二：使用复合组件自由拼装

```tsx
import {
  ModelConfigRoot,
  ModelProviderSelect,
  ModelKeyInput,
  ModelSelect,
  ModelAdvancedSettings,
  useModelConfig,
} from './components/model-config';

function MyApp() {
  const modelConfig = useModelConfig();

  return (
    <ModelConfigRoot config={modelConfig}>
      {/* 把模型选择放在最显眼的位置 */}
      <div className="header-select">
        <ModelProviderSelect />
        <ModelSelect />
      </div>

      {/* 把 API Key 藏在折叠面板里 */}
      <details>
        <summary>密钥与高级设置</summary>
        <ModelKeyInput />
        <ModelAdvancedSettings />
      </details>
    </ModelConfigRoot>
  );
}
```

## API

### `useModelConfig(): UseModelConfigReturn`

核心 Hook，管理所有模型配置的状态和逻辑。

#### 返回值

| 属性 | 类型 | 说明 |
|------|------|------|
| `effectiveConfig` | `EffectiveConfig` | 当前生效的 API 配置（`{ baseUrl, apiKey, model }`） |
| `activeProviderId` | `string` | 当前激活的提供商 ID（`'server'` 或预设 ID） |
| `currentConfig` | `ProviderConfig` | 当前提供商的完整配置 |
| `modelsInfo` | `ModelsInfo \| null` | 服务器默认配置信息 |
| `providerPresets` | `ProviderPreset[]` | 可用的提供商预设列表 |
| `filteredModels` | `string[]` | 经过搜索/筛选后的模型列表 |
| `safeFreeModels` | `string[]` | 当前提供商的免费模型列表 |
| `settingsOpen` | `boolean` | 配置面板是否展开 |
| `configSaved` | `boolean` | 配置是否已保存到服务器 |
| `fetchingModels` | `boolean` | 是否正在获取模型列表 |
| `fetchModelsError` | `string \| null` | 获取模型列表的错误信息 |

#### 操作方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `handleSwitchProvider` | `(id: string) => void` | 切换提供商 |
| `updateProvider` | `(patch: Partial<ProviderConfig>) => void` | 更新当前提供商配置 |
| `handleFetchModels` | `() => Promise<void>` | 从提供商获取可用模型列表 |
| `handleSaveConfig` | `() => Promise<void>` | 保存当前配置为服务器默认 |
| `setSettingsOpen` | `(v: boolean) => void` | 展开/收起配置面板 |
| `setShowFreeOnly` | `(v: boolean) => void` | 切换只显示免费模型 |
| `setAdvancedSettingsOpen` | `(v: boolean) => void` | 展开/收起高级设置 |

### `<ModelConfig />`

预组合组件，根据 `variant` 渲染不同形态。

#### Props

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `config` | `UseModelConfigReturn` | ✅ | — | `useModelConfig()` 的返回值 |
| `title` | `string` | ❌ | `'AI 配置'` | 面板标题文字（仅 `default` 变体显示） |
| `variant` | `ModelConfigVariant` | ❌ | `'default'` | 展现形态 |

#### Variant 说明

| Variant | 说明 | 适用场景 |
|---------|------|----------|
| `default` | 可折叠面板，带标题行和展开/收起切换 | 侧边栏内嵌 |
| `compact` | 仅提供商下拉 + 模型选择，无 API Key / 高级设置 | 空间受限的行内区域 |
| `modal-content` | 无折叠头，无外边距，撑满父容器，底部带"保存默认"按钮 | 弹窗内容区 |

### 复合组件

所有子组件均接受 `config: UseModelConfigReturn` 作为 prop。若未传入，则从 `<ModelConfigRoot>` 的 Context 中获取。

| 组件 | 说明 |
|------|------|
| `<ModelConfigRoot>` | Context Provider，包裹子组件以共享 config |
| `<ModelProviderSelect>` | 提供商下拉选择器 |
| `<ModelKeyInput>` | API Key 输入框（含密码切换） |
| `<ModelSelect>` | 模型选择器（含搜索、免费筛选、服务器默认 select） |
| `<ModelAdvancedSettings>` | 高级设置折叠区（Base URL） |

## 类型

### `EffectiveConfig`

API 调用时使用的生效配置。

```ts
interface EffectiveConfig {
  baseUrl: string;   // API 基础地址
  apiKey: string;    // API 密钥（服务器默认时为空）
  model: string;     // 当前选中的模型
}
```

### `ProviderConfig`

单个提供商的完整配置。

```ts
interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  models: string[];
  freeModels: string[];
  selectedModel: string;
}
```

### `ProviderPreset`

提供商预设信息。

```ts
interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  needsApiKey: boolean;
  defaultApiKey?: string;
}
```

### `ModelsInfo`

服务器默认配置信息。

```ts
interface ModelsInfo {
  default: string;
  models: string[];
  baseUrl: string;
  hasApiKey: boolean;
  providerPresets: ProviderPreset[];
}
```

### `ModelConfigVariant`

```ts
type ModelConfigVariant = 'default' | 'compact' | 'modal-content';
```

## 数据持久化

- 提供商配置自动持久化到 `localStorage`（key: `ai_providers`）
- 当前激活的提供商 ID 持久化到 `localStorage`（key: `ai_active_provider`）
- 保存到服务器 `.env` 通过 `handleSaveConfig()` 触发

## 后端依赖

组件依赖以下 API 接口（来自 `geminiService.ts`）：

- `fetchModels()` — 获取服务器默认配置和提供商预设
- `fetchModelsFromProvider(apiKey?, baseUrl?)` — 从指定提供商获取模型列表
- `saveConfig(config)` — 保存配置到服务器 `.env`

如需在其他项目中使用，需确保后端提供兼容的接口，或替换 `useModelConfig.ts` 中的 API 调用。
