import { useState, useRef, useEffect } from 'react';
import {
  fetchLlmConfig,
  updateLlmConfig,
  fetchModelsFromProvider,
  testLlmConfig,
  type LlmConfigResponse,
} from '../../services/llmConfigService';
import type {
  ProviderConfig,
  ProviderPreset,
  ModelsInfo,
  UseModelConfigReturn,
  EffectiveConfig,
} from './types';

// localStorage helpers for client-side provider state
const LS_PROVIDERS_KEY = 'ls_ai_providers';
const LS_ACTIVE_KEY = 'ls_ai_active_provider';

function loadProviders(): Record<string, ProviderConfig> {
  try {
    const raw = localStorage.getItem(LS_PROVIDERS_KEY);
    if (raw) {
      const data: Record<string, ProviderConfig> = JSON.parse(raw);
      for (const key of Object.keys(data)) {
        if (data[key].models) data[key].models = [...new Set(data[key].models)];
      }
      return data;
    }
  } catch {}
  return {};
}

function persistProviders(providers: Record<string, ProviderConfig>) {
  localStorage.setItem(LS_PROVIDERS_KEY, JSON.stringify(providers));
}

export function useModelConfig(): UseModelConfigReturn {
  // UI state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [testingConfig, setTestingConfig] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [showFreeOnly, setShowFreeOnly] = useState(false);
  const [modelInput, setModelInput] = useState('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);

  // Refs
  const providerDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Data state
  const [modelsInfo, setModelsInfo] = useState<ModelsInfo | null>(null);
  const [providerPresets, setProviderPresets] = useState<ProviderPreset[]>([]);
  const [activeProviderId, setActiveProviderId] = useState(
    () => localStorage.getItem(LS_ACTIVE_KEY) || 'server'
  );
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>(() => loadProviders());

  // Derived: current provider config
  const currentConfig: ProviderConfig = providers[activeProviderId] || {
    apiKey: '',
    baseUrl: '',
    models: [],
    freeModels: [],
    selectedModel: '',
  };
  const safeFreeModels = currentConfig.freeModels || [];

  // Derived: filtered model list
  const displayModels =
    showFreeOnly && safeFreeModels.length > 0 ? safeFreeModels : currentConfig.models;
  const isSearching = modelInput !== '' && modelInput !== currentConfig.selectedModel;
  const filteredModels = isSearching
    ? displayModels.filter((m) => m.toLowerCase().includes(modelInput.toLowerCase()))
    : displayModels;

  // Derived: effective config for API calls
  const effectiveConfig: EffectiveConfig = {
    baseUrl:
      activeProviderId === 'server'
        ? modelsInfo?.baseUrl || ''
        : currentConfig.baseUrl ||
          providerPresets.find((p) => p.id === activeProviderId)?.baseUrl ||
          '',
    apiKey: activeProviderId === 'server' ? '' : currentConfig.apiKey,
    model: currentConfig.selectedModel || modelsInfo?.default || '',
  };

  // Persist to localStorage on change
  useEffect(() => {
    persistProviders(providers);
    localStorage.setItem(LS_ACTIVE_KEY, activeProviderId);
  }, [providers, activeProviderId]);

  // Sync modelInput with selectedModel
  useEffect(() => {
    setModelInput(currentConfig.selectedModel || '');
  }, [currentConfig.selectedModel]);

  // Init: load server LLM config and build provider presets
  useEffect(() => {
    fetchLlmConfig().then((resp: LlmConfigResponse) => {
      const presets: ProviderPreset[] = resp.providerPresets.map((p) => ({
        id: p.id,
        name: p.name,
        baseUrl: p.baseUrl,
        needsApiKey: p.needsApiKey,
        defaultApiKey: p.defaultApiKey,
      }));
      setProviderPresets(presets);
      setModelsInfo({
        default: resp.serverDefault.model,
        models: resp.serverDefault.models,
        baseUrl: resp.serverDefault.baseUrl,
        hasApiKey: resp.serverDefault.hasApiKey,
        providerPresets: presets,
      });

      // Initialize server provider from backend config
      setProviders((prev) => {
        const updated = { ...prev };
        // llamacpp provider
        if (resp.llamacpp) {
          updated.llamacpp = {
            ...updated.llamacpp,
            apiKey: updated.llamacpp?.apiKey || resp.llamacpp.apiKey || '',
            baseUrl: updated.llamacpp?.baseUrl || resp.llamacpp.baseUrl,
            selectedModel: updated.llamacpp?.selectedModel || resp.llamacpp.model,
            models: updated.llamacpp?.models?.length
              ? updated.llamacpp.models
              : [resp.llamacpp.model],
            freeModels: updated.llamacpp?.freeModels || [],
          };
        }
        // provider (remote API)
        if (resp.provider) {
          updated.provider = {
            ...updated.provider,
            apiKey: updated.provider?.apiKey || resp.provider.apiKey || '',
            baseUrl: updated.provider?.baseUrl || resp.provider.baseUrl,
            selectedModel: updated.provider?.selectedModel || resp.provider.model,
            models: updated.provider?.models?.length
              ? updated.provider.models
              : [resp.provider.model],
            freeModels: updated.provider?.freeModels || [],
          };
        }
        // server (active provider)
        updated.server = {
          ...updated.server,
          apiKey: '',
          baseUrl: resp.serverDefault.baseUrl,
          selectedModel: updated.server?.selectedModel || resp.serverDefault.model,
          models: updated.server?.models?.length
            ? updated.server.models
            : resp.serverDefault.models,
          freeModels: updated.server?.freeModels || [],
        };
        return updated;
      });

      // Set active provider to server default if not already set
      const stored = localStorage.getItem(LS_ACTIVE_KEY);
      if (!stored) {
        setActiveProviderId('server');
      }
    }).catch(() => {});
  }, []);

  // Close provider dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        providerDropdownRef.current &&
        !providerDropdownRef.current.contains(e.target as Node)
      ) {
        setProviderDropdownOpen(false);
      }
    };
    if (providerDropdownOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [providerDropdownOpen]);

  // Actions
  const handleSwitchProvider = (id: string) => {
    setActiveProviderId(id);
    const preset = providerPresets.find((p) => p.id === id);
    if (!providers[id]) {
      setProviders((prev) => ({
        ...prev,
        [id]: {
          apiKey: preset?.defaultApiKey || '',
          baseUrl: preset?.baseUrl || '',
          models: [],
          freeModels: [],
          selectedModel: '',
        },
      }));
    }
    if (id === 'custom') {
      setAdvancedSettingsOpen(true);
    }
    setProviderDropdownOpen(false);
  };

  const updateProvider = (patch: Partial<ProviderConfig>) => {
    setProviders((prev) => ({
      ...prev,
      [activeProviderId]: { ...prev[activeProviderId], ...patch },
    }));
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setFetchModelsError(null);
    try {
      const cfg = providers[activeProviderId] || currentConfig;
      const baseUrl =
        cfg.baseUrl || providerPresets.find((p) => p.id === activeProviderId)?.baseUrl;
      if (!baseUrl) {
        throw new Error('请先设置 Base URL');
      }
      const result = await fetchModelsFromProvider({
        apiKey: cfg.apiKey || undefined,
        baseUrl,
      });
      const models = [...new Set(result.models)];
      const freeModels = [...new Set(result.freeModels)];
      updateProvider({ models, freeModels });
      if (models.length > 0 && !providers[activeProviderId]?.selectedModel) {
        updateProvider({ selectedModel: models[0] });
      }
    } catch (err: any) {
      const msg = err?.message || '获取模型列表失败';
      setFetchModelsError(msg);
      console.error('Failed to fetch models:', err);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTestConfig = async () => {
    setTestingConfig(true);
    setTestResult(null);
    setTestError(null);
    try {
      const result = await testLlmConfig();
      setTestResult(result.response || '连接成功');
      setTimeout(() => setTestResult(null), 3000);
    } catch (err: any) {
      setTestError(err?.message || '测试失败');
      setTimeout(() => setTestError(null), 5000);
    } finally {
      setTestingConfig(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setConfigSaved(false);
    try {
      // Determine which provider to save based on activeProviderId
      const updates: any = {};

      if (activeProviderId === 'server') {
        // Server default: just update the model selection
        // The active provider on server stays the same
        if (currentConfig.selectedModel) {
          const serverProvider = modelsInfo?.default
            ? (providers.llamacpp?.selectedModel === currentConfig.selectedModel ? 'llamacpp' : 'provider')
            : 'llamacpp';
          // Update the model for whichever provider is active on server
          if (serverProvider === 'llamacpp' && providers.llamacpp) {
            updates.llamacpp = { model: currentConfig.selectedModel };
          } else if (providers.provider) {
            updates.provider = { model_id: currentConfig.selectedModel };
          }
        }
      } else if (activeProviderId === 'llamacpp') {
        updates.activeProvider = 'llamacpp';
        updates.llamacpp = {
          baseUrl: currentConfig.baseUrl || undefined,
          model: currentConfig.selectedModel || undefined,
          api_key: currentConfig.apiKey || undefined,
        };
      } else if (activeProviderId === 'provider') {
        updates.activeProvider = 'provider';
        updates.provider = {
          base_url: currentConfig.baseUrl || undefined,
          model_id: currentConfig.selectedModel || undefined,
          api_key: currentConfig.apiKey || undefined,
        };
      } else if (activeProviderId === 'custom') {
        // Custom provider: save as the [provider] section
        updates.activeProvider = 'provider';
        updates.provider = {
          base_url: currentConfig.baseUrl || undefined,
          model_id: currentConfig.selectedModel || undefined,
          api_key: currentConfig.apiKey || undefined,
        };
      }

      await updateLlmConfig(updates);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setSavingConfig(false);
    }
  };

  return {
    // State
    settingsOpen,
    setSettingsOpen,
    showApiKey,
    fetchingModels,
    fetchModelsError,
    savingConfig,
    configSaved,
    modelsInfo,
    providerPresets,
    showFreeOnly,
    modelInput,
    modelDropdownOpen,
    advancedSettingsOpen,
    providerDropdownOpen,
    activeProviderId,
    currentConfig,
    safeFreeModels,
    filteredModels,
    effectiveConfig,

    // Refs
    providerDropdownRef,
    modelDropdownRef,

    // Actions
    handleSwitchProvider,
    updateProvider,
    handleFetchModels,
    handleSaveConfig,
    setShowApiKey,
    setShowFreeOnly,
    setModelInput,
    setModelDropdownOpen,
    setAdvancedSettingsOpen,
    setProviderDropdownOpen,

    // Test
    testingConfig,
    testResult,
    testError,
    handleTestConfig,
  };
}
