import React, { createContext, useContext } from 'react';
import {
  Loader2,
  ChevronDown,
  Cpu,
  Settings,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
  Check,
  Zap,
} from 'lucide-react';
import type {
  UseModelConfigReturn,
  ModelConfigProps,
  ModelConfigRootProps,
  SubComponentProps,
} from './types';

// ─── Context for compound components ─────────────────────────
const ModelConfigContext = createContext<UseModelConfigReturn | null>(null);

function useModelConfigContext() {
  const ctx = useContext(ModelConfigContext);
  if (!ctx) throw new Error('ModelConfig sub-components must be used within <ModelConfigRoot>');
  return ctx;
}

// ─── Compound Components ─────────────────────────────────────

/** Context provider — wraps sub-components and provides config via context */
export function ModelConfigRoot({ config, children }: ModelConfigRootProps) {
  return (
    <ModelConfigContext.Provider value={config}>
      {children}
    </ModelConfigContext.Provider>
  );
}

/** Provider selector dropdown */
export function ModelProviderSelect({ config: configProp }: SubComponentProps) {
  const config = configProp ?? useModelConfigContext();
  const {
    providerPresets,
    providerDropdownOpen,
    setProviderDropdownOpen,
    activeProviderId,
    providerDropdownRef,
    handleSwitchProvider,
  } = config;

  const providerLabel =
    activeProviderId === 'server'
      ? '服务器默认'
      : providerPresets.find((p) => p.id === activeProviderId)?.name || activeProviderId;

  return (
    <div className="relative" ref={providerDropdownRef}>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">
        提供商
      </label>
      <button
        type="button"
        onClick={() => setProviderDropdownOpen(!providerDropdownOpen)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 border border-slate-300 rounded-md bg-white hover:border-slate-400 transition-colors text-xs"
      >
        <span className="flex items-center gap-1.5 truncate">
          <Cpu className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="truncate">{providerLabel}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${providerDropdownOpen ? 'rotate-180' : ''}`} />
      </button>
      {providerDropdownOpen && (
        <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          <div
            onMouseDown={() => handleSwitchProvider('server')}
            className={`px-2.5 py-2 text-xs cursor-pointer flex items-center gap-2 ${
              activeProviderId === 'server' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            服务器默认
          </div>
          {providerPresets.map((p) => (
            <div
              key={p.id}
              onMouseDown={() => handleSwitchProvider(p.id)}
              className={`px-2.5 py-2 text-xs cursor-pointer flex items-center gap-2 ${
                activeProviderId === p.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {p.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** API Key input (only shown for non-server providers) */
export function ModelKeyInput({ config: configProp }: SubComponentProps) {
  const config = configProp ?? useModelConfigContext();
  const {
    showApiKey,
    currentConfig,
    updateProvider,
    setShowApiKey,
  } = config;

  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        API Key
      </label>
      <div className="relative">
        <input
          type={showApiKey ? 'text' : 'password'}
          value={currentConfig.apiKey}
          onChange={(e) => updateProvider({ apiKey: e.target.value })}
          placeholder="输入 API Key（Ollama 等本地模型可留空）"
          className="w-full px-2.5 py-1.5 pr-8 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs bg-white"
        />
        <button
          type="button"
          onClick={() => setShowApiKey(!showApiKey)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

/** Model selector — combobox with dropdown, free-model filter, and server-default select */
export function ModelSelect({ config: configProp }: SubComponentProps) {
  const config = configProp ?? useModelConfigContext();
  const {
    activeProviderId,
    currentConfig,
    safeFreeModels,
    filteredModels,
    modelInput,
    modelDropdownOpen,
    fetchingModels,
    fetchModelsError,
    showFreeOnly,
    modelsInfo,
    modelDropdownRef,
    setModelInput,
    setModelDropdownOpen,
    updateProvider,
    handleFetchModels,
    setShowFreeOnly,
  } = config;

  // Server default: simple select or label
  if (activeProviderId === 'server') {
    return (
      <div className="text-xs text-slate-500 space-y-2">
        <p className="text-slate-400">使用服务器提供的接口和密钥，您可在此基础上选择模型</p>
        {modelsInfo && (
          <>
            <p className="text-slate-400">接口: <code className="bg-slate-100 px-1 rounded text-[10px]">{modelsInfo.baseUrl}</code></p>
            {modelsInfo.models.length > 1 ? (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">选择模型</label>
                <select
                  value={currentConfig.selectedModel}
                  onChange={(e) => updateProvider({ selectedModel: e.target.value })}
                  className="w-full min-w-0 px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs bg-white truncate"
                  title={currentConfig.selectedModel}
                >
                  {modelsInfo.models.map((m) => (
                    <option key={m} value={m} title={m}>{m}{m === modelsInfo.default ? ' (默认)' : ''}</option>
                  ))}
                </select>
              </div>
            ) : (
              <p>当前模型: <code className="bg-slate-100 px-1 rounded text-[10px] font-medium text-slate-600">{modelsInfo.default}</code></p>
            )}
          </>
        )}
      </div>
    );
  }

  // Non-server: combobox or plain input
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
        <Cpu className="w-3 h-3" />
        模型
      </label>
      {currentConfig.models.length > 0 ? (
        <>
          <div className="relative min-w-0" ref={modelDropdownRef}>
            <input
              type="text"
              value={modelInput}
              onChange={(e) => {
                setModelInput(e.target.value);
                updateProvider({ selectedModel: e.target.value });
                setModelDropdownOpen(true);
              }}
              onFocus={() => setModelDropdownOpen(true)}
              onBlur={() => setTimeout(() => setModelDropdownOpen(false), 150)}
              placeholder="输入或选择模型"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs bg-white pr-14 truncate"
              title={currentConfig.selectedModel}
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <button
                onClick={handleFetchModels}
                disabled={fetchingModels}
                className="p-0.5 text-slate-400 hover:text-blue-500 disabled:opacity-50 transition-colors"
                title="刷新模型列表"
                tabIndex={-1}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${fetchingModels ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                className="p-0.5 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            {modelDropdownOpen && filteredModels.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                {filteredModels.map((m) => (
                  <div
                    key={m}
                    onMouseDown={() => {
                      setModelInput(m);
                      updateProvider({ selectedModel: m });
                      setModelDropdownOpen(false);
                    }}
                    className={`px-2.5 py-1.5 text-xs cursor-pointer truncate ${
                      m === currentConfig.selectedModel
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    title={m}
                  >
                    {m}
                    {safeFreeModels.includes(m) && (
                      <span className="ml-1 text-[9px] text-green-600 font-normal">免费</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">支持搜索模型名，或点击刷新获取最新列表</p>
          {currentConfig.models.length > 0 && (
            <div className="mt-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showFreeOnly}
                  onChange={(e) => {
                    setShowFreeOnly(e.target.checked);
                    if (e.target.checked && safeFreeModels.length > 0 && !safeFreeModels.includes(currentConfig.selectedModel)) {
                      updateProvider({ selectedModel: safeFreeModels[0] });
                      setModelInput(safeFreeModels[0]);
                    }
                  }}
                  className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-500">只显示免费模型</span>
                <span className="text-[10px] text-slate-400">({safeFreeModels.length}/{currentConfig.models.length})</span>
              </label>
              {showFreeOnly && safeFreeModels.length === 0 && (
                <p className="text-[10px] text-amber-500 mt-0.5">该提供商未返回免费模型信息，无法筛选</p>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-1.5">
          <div className="relative min-w-0">
            <input
              type="text"
              value={currentConfig.selectedModel}
              onChange={(e) => updateProvider({ selectedModel: e.target.value })}
              placeholder="输入模型名称，如 gpt-4o、deepseek-chat"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs bg-white pr-8 truncate"
            />
            <button
              onClick={handleFetchModels}
              disabled={fetchingModels}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-blue-500 disabled:opacity-50 transition-colors"
              title="刷新模型列表"
              tabIndex={-1}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${fetchingModels ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-[10px] text-slate-400">可直接输入模型名，或点击刷新获取列表</p>
          <button
            onClick={handleFetchModels}
            disabled={fetchingModels}
            className="w-full px-2 py-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors border border-blue-200 disabled:opacity-50 text-xs flex items-center justify-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${fetchingModels ? 'animate-spin' : ''}`} />
            {fetchingModels ? '获取中...' : '从 Provider 获取模型列表'}
          </button>
        </div>
      )}
      {fetchModelsError && (
        <p className="text-[10px] text-red-500 mt-1">{fetchModelsError}</p>
      )}
    </div>
  );
}

/** Advanced settings collapsible (Base URL) */
export function ModelAdvancedSettings({ config: configProp }: SubComponentProps) {
  const config = configProp ?? useModelConfigContext();
  const {
    activeProviderId,
    currentConfig,
    providerPresets,
    advancedSettingsOpen,
    setAdvancedSettingsOpen,
    updateProvider,
  } = config;

  return (
    <div className="border-t border-slate-100 pt-2">
      <button
        type="button"
        onClick={() => setAdvancedSettingsOpen(!advancedSettingsOpen)}
        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${advancedSettingsOpen ? 'rotate-180' : '-rotate-90'}`} />
        高级设置
      </button>
      {advancedSettingsOpen && (
        <div className="mt-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">
            API Base URL
          </label>
          <input
            type="text"
            value={currentConfig.baseUrl}
            onChange={(e) => updateProvider({ baseUrl: e.target.value })}
            placeholder={providerPresets.find((p) => p.id === activeProviderId)?.baseUrl || 'https://api.openai.com/v1'}
            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs bg-white truncate"
          />
        </div>
      )}
    </div>
  );
}

// ─── Save Button (shared piece) ──────────────────────────────
function SaveButton({ config }: { config: UseModelConfigReturn }) {
  const {
    savingConfig,
    configSaved,
    activeProviderId,
    currentConfig,
    handleSaveConfig,
  } = config;

  return (
    <button
      onClick={handleSaveConfig}
      disabled={savingConfig || (activeProviderId !== 'server' && !currentConfig.selectedModel)}
      className={`text-[11px] font-medium flex items-center gap-1 transition-all ${
        configSaved
          ? 'text-green-600'
          : 'text-slate-400 hover:text-blue-600 disabled:opacity-50'
      }`}
    >
      {configSaved ? (
        <><Check className="w-3 h-3" /> 已保存</>
      ) : savingConfig ? (
        <><Loader2 className="w-3 h-3 animate-spin" /> 保存中</>
      ) : (
        <><Save className="w-3 h-3" /> 保存默认</>
      )}
    </button>
  );
}

// ─── Test Button (shared piece) ──────────────────────────────
function TestButton({ config }: { config: UseModelConfigReturn }) {
  const {
    testingConfig,
    testResult,
    testError,
    handleTestConfig,
  } = config;

  return (
    <div className="flex items-center gap-2">
      {testResult && (
        <span className="text-[10px] text-green-600">✓ 可用</span>
      )}
      {testError && (
        <span className="text-[10px] text-red-500 max-w-[120px] truncate" title={testError}>{testError}</span>
      )}
      <button
        onClick={handleTestConfig}
        disabled={testingConfig}
        className="text-[11px] font-medium flex items-center gap-1 transition-all text-slate-400 hover:text-blue-600 disabled:opacity-50"
      >
        {testingConfig ? (
          <><Loader2 className="w-3 h-3 animate-spin" /> 测试中...</>
        ) : testResult ? (
          <><Check className="w-3 h-3" /> 重新测试</>
        ) : (
          <><Zap className="w-3 h-3" /> 测试</>
        )}
      </button>
    </div>
  );
}

// ─── Pre-composed ModelConfig with variant support ────────────

export function ModelConfig({ config, title = 'AI 配置', variant = 'default' }: ModelConfigProps) {
  const {
    settingsOpen,
    setSettingsOpen,
    activeProviderId,
    providerPresets,
  } = config;

  const providerLabel =
    activeProviderId === 'server'
      ? '服务器默认'
      : providerPresets.find((p) => p.id === activeProviderId)?.name || activeProviderId;

  // ── modal-content: no header/toggle, just the form, no wrapper styling ──
  if (variant === 'modal-content') {
    return (
      <div className="space-y-4">
        <ModelProviderSelect config={config} />
        {activeProviderId !== 'server' && (
          <>
            <ModelKeyInput config={config} />
            <ModelSelect config={config} />
            <ModelAdvancedSettings config={config} />
          </>
        )}
        {activeProviderId === 'server' && (
          <ModelSelect config={config} />
        )}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <TestButton config={config} />
          <SaveButton config={config} />
        </div>
      </div>
    );
  }

  // ── compact: only provider + model inline, no collapsible ──
  if (variant === 'compact') {
    return (
      <div className="space-y-2">
        <ModelProviderSelect config={config} />
        {activeProviderId !== 'server' && <ModelSelect config={config} />}
        {activeProviderId === 'server' && <ModelSelect config={config} />}
      </div>
    );
  }

  // ── default: original collapsible panel ──
  return (
    <div className="mb-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors py-1 min-w-0"
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span className="truncate">{title}</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full border border-slate-200 truncate max-w-[80px]">
            {providerLabel}
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {settingsOpen && (
            <>
              <TestButton config={config} />
              <SaveButton config={config} />
            </>
          )}
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {settingsOpen && (
        <div className="mt-3 space-y-3">
          <ModelProviderSelect config={config} />
          {activeProviderId !== 'server' && (
            <>
              <ModelKeyInput config={config} />
              <ModelSelect config={config} />
              <ModelAdvancedSettings config={config} />
            </>
          )}
          {activeProviderId === 'server' && (
            <ModelSelect config={config} />
          )}
        </div>
      )}
    </div>
  );
}
