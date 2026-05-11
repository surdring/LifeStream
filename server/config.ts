import fs from 'fs/promises';
import path from 'path';
import toml from '@iarna/toml';
import { z } from 'zod';

const ConfigSchema = z
  .object({
  server: z.object({
    host: z.string().min(1).default('127.0.0.1'),
    port: z.coerce.number().int().positive().default(8787),
  }).partial().default({ host: '127.0.0.1', port: 8787 }),
  auth: z
    .object({
      jwt_secret: z.string().min(16),
    })
    .partial()
    .optional(),
  postgres: z.object({
    host: z.string().min(1),
    port: z.coerce.number().int().positive().default(5432),
    user: z.string().min(1),
    password: z.string().default(''),
    database: z.string().min(1),
  }),
  llamacpp: z
    .object({
      baseUrl: z.string().url(),
      model: z.string().min(1),
      temperature: z.coerce.number().min(0).max(2).default(0.3),
      api_key: z.string().min(1).optional(),
    })
    .optional(),
  llm: z
    .object({
      llm_provider: z.enum(['llamacpp', 'provider']).default('llamacpp'),
    })
    .partial()
    .default({ llm_provider: 'llamacpp' }),
  provider: z
    .object({
      api_key: z.string().min(1),
      base_url: z.string().url(),
      model_id: z.string().min(1),
      temperature: z.coerce.number().min(0).max(2).optional(),
    })
    .optional(),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.llm.llm_provider === 'llamacpp' && !cfg.llamacpp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'llamacpp config is required when llm.llm_provider=llamacpp',
        path: ['llamacpp'],
      });
    }
    if (cfg.llm.llm_provider === 'provider' && !cfg.provider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'provider config is required when llm.llm_provider=provider',
        path: ['provider'],
      });
    }
  });

export type AppConfig = z.infer<typeof ConfigSchema>;

export async function loadConfig(configPath = path.join(process.cwd(), 'config.toml')): Promise<AppConfig> {
  let rawText: string;
  try {
    rawText = await fs.readFile(configPath, 'utf-8');
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      throw new Error(
        `Failed to read config file at ${configPath}: file not found. Please copy config.toml.example to config.toml and edit the values.`
      );
    }
    throw new Error(`Failed to read config file at ${configPath}: ${err?.message || String(err)}`);
  }

  let parsed: any;
  try {
    parsed = toml.parse(rawText);
  } catch (err: any) {
    throw new Error(`Failed to parse TOML config at ${configPath}: ${err?.message || String(err)}`);
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid config.toml: ${result.error.message}`);
  }

  const data: any = result.data;
  const envJwtSecret = process.env.LIFESTREAM_JWT_SECRET || process.env.JWT_SECRET;
  if (!data.auth?.jwt_secret && typeof envJwtSecret === 'string' && envJwtSecret.length > 0) {
    data.auth = { ...(data.auth || {}), jwt_secret: envJwtSecret };
  }

  return data as AppConfig;
}

export async function saveConfig(
  updates: Partial<AppConfig>,
  configPath = path.join(process.cwd(), 'config.toml'),
): Promise<AppConfig> {
  let rawText: string;
  try {
    rawText = await fs.readFile(configPath, 'utf-8');
  } catch (err: any) {
    throw new Error(`Failed to read config file: ${err?.message || String(err)}`);
  }

  let parsed: any;
  try {
    parsed = toml.parse(rawText);
  } catch (err: any) {
    throw new Error(`Failed to parse config: ${err?.message || String(err)}`);
  }

  // Deep merge updates into parsed config
  for (const [section, value] of Object.entries(updates)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      parsed[section] = { ...(parsed[section] || {}), ...value };
    } else if (value !== undefined) {
      parsed[section] = value;
    }
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid config after update: ${result.error.message}`);
  }

  let output: string;
  try {
    output = toml.stringify(parsed as any);
  } catch (err: any) {
    throw new Error(`Failed to serialize config: ${err?.message || String(err)}`);
  }

  await fs.writeFile(configPath, output, 'utf-8');
  return result.data as AppConfig;
}
