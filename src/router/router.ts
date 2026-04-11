import type { Config, RouteConfig, CustomModelConfig } from '../config/config.js';
import type { Provider } from './providers/base.js';
import { createProvider } from './providers/base.js';

export class Router {
  private routes: RouteConfig[];
  private providers: Map<string, Provider>;
  private customModels: Map<string, CustomModelConfig>;

  constructor(config: Config) {
    this.routes = config.routes || [];
    this.providers = new Map();
    this.customModels = new Map();

    // Initialize providers
    for (const [name, providerConfig] of Object.entries(config.providers)) {
      this.providers.set(name, createProvider(name, providerConfig));
    }

    // Initialize custom models mapping
    for (const customModel of config.custom_models || []) {
      this.customModels.set(customModel.name, customModel);
    }
  }

  route(model: string): { provider: Provider; actualModel: string } | null {
    // 1. First check custom models (exact match)
    const customModel = this.customModels.get(model);
    if (customModel) {
      const provider = this.providers.get(customModel.provider);
      if (provider) {
        return {
          provider,
          actualModel: customModel.model,
        };
      }
    }

    // 2. Then check route patterns
    for (const route of this.routes) {
      if (this.matchPattern(route.pattern, model)) {
        const provider = this.providers.get(route.provider);
        if (provider) {
          return {
            provider,
            actualModel: route.model || model,
          };
        }
      }
    }
    return null;
  }

  private matchPattern(pattern: string, model: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return model.startsWith(prefix);
    }
    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      return model.endsWith(suffix);
    }
    return pattern === model;
  }

  getProvider(name: string): Provider | undefined {
    return this.providers.get(name);
  }

  getAllProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getCustomModels(): CustomModelConfig[] {
    return Array.from(this.customModels.values());
  }

  getCustomModel(name: string): CustomModelConfig | undefined {
    return this.customModels.get(name);
  }
}
