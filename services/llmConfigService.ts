import { request } from './apiClient';

export interface LlmProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  needsApiKey: boolean;
  defaultApiKey?: string;
}

export interface LlmActiveConfig {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

export interface LlmProviderDetail {
  baseUrl: string;
  model: string;
  temperature: number;
  apiKey: string;
  hasApiKey: boolean;
}

export interface LlmServerDefault {
  baseUrl: string;
  model: string;
  models: string[];
  hasApiKey: boolean;
}

export interface LlmConfigResponse {
  activeProvider: string;
  activeConfig: LlmActiveConfig;
  providerPresets: LlmProviderPreset[];
  serverDefault: LlmServerDefault;
  llamacpp: LlmProviderDetail | null;
  provider: LlmProviderDetail | null;
}

export interface LlmConfigUpdate {
  activeProvider?: 'llamacpp' | 'provider';
  llamacpp?: {
    baseUrl?: string;
    model?: string;
    temperature?: number;
    api_key?: string;
  };
  provider?: {
    base_url?: string;
    model_id?: string;
    api_key?: string;
    temperature?: number;
  };
}

export interface FetchModelsResponse {
  models: string[];
  freeModels: string[];
}

export async function fetchLlmConfig(): Promise<LlmConfigResponse> {
  return request('/api/llm/config');
}

export async function updateLlmConfig(updates: LlmConfigUpdate): Promise<{ ok: boolean }> {
  return request('/api/llm/config', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function fetchModelsFromProvider(params: {
  apiKey?: string;
  baseUrl: string;
}): Promise<FetchModelsResponse> {
  return request('/api/llm/fetch-models', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function testLlmConfig(): Promise<{ ok: boolean; response: string }> {
  return request('/api/llm/test', { method: 'POST' });
}
