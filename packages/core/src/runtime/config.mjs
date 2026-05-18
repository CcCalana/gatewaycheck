import { readFile } from 'node:fs/promises';

export async function loadConfig(path) {
  if (!path) {
    throw new Error('config path is required');
  }
  const raw = await readFile(path, 'utf8');
  const config = JSON.parse(raw);
  validateConfig(config);
  return Object.freeze(config);
}

export function resolveApiKey(config, env = process.env) {
  const envName = config.apiKeyEnv;
  if (!envName) return '';
  const value = env[envName];
  if (!value) {
    throw new Error(`missing API key environment variable: ${envName}`);
  }
  return value;
}

export function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('config must be an object');
  }
  if (!config.baseUrl || typeof config.baseUrl !== 'string') {
    throw new Error('config.baseUrl is required');
  }
  new URL(config.baseUrl);
  if (config.apiKey && !String(config.apiKey).includes('${')) {
    throw new Error('do not store raw API keys in config; use apiKeyEnv');
  }
}
