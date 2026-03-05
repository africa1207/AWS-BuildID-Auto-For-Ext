/**
 * Mail Providers Registry - 邮箱渠道注册表
 * 统一管理所有邮箱渠道，提供工厂方法
 */

import { GmailProvider } from './gmail.js';
import { GuerrillaProvider } from './guerrilla.js';
import { GPTMailProvider } from './gptmail.js';
import { DuckMailProvider } from './duckmail.js';
import { MoeMailProvider } from './moemail.js';
import { TempServiceProvider } from './temp-service.js';

// 渠道注册表
const providers = {
  gmail: GmailProvider,
  guerrilla: GuerrillaProvider,
  gptmail: GPTMailProvider,
  duckmail: DuckMailProvider,
  moemail: MoeMailProvider,
  'temp-service': TempServiceProvider
};

// 默认渠道
const DEFAULT_PROVIDER = 'gmail';

/**
 * 创建渠道实例
 * @param {string} id - 渠道 ID
 * @param {Object} options - 初始化选项
 * @returns {MailProvider}
 */
function createProvider(id, options = {}) {
  const ProviderClass = providers[id];
  if (!ProviderClass) {
    throw new Error(`未知的邮箱渠道: ${id}`);
  }
  return new ProviderClass(options);
}

/**
 * 获取所有可用渠道列表
 * @returns {Array<{id: string, name: string, needsConfig: boolean}>}
 */
function getProviderList() {
  return Object.entries(providers).map(([id, ProviderClass]) => ({
    id,
    name: ProviderClass.name,
    needsConfig: ProviderClass.needsConfig,
    supportsAutoVerification: ProviderClass.supportsAutoVerification
  }));
}

/**
 * 检查渠道是否存在
 * @param {string} id - 渠道 ID
 * @returns {boolean}
 */
function hasProvider(id) {
  return id in providers;
}

/**
 * 获取渠道类（不实例化）
 * @param {string} id - 渠道 ID
 * @returns {typeof MailProvider}
 */
function getProviderClass(id) {
  return providers[id] || null;
}

export {
  providers,
  DEFAULT_PROVIDER,
  createProvider,
  getProviderList,
  hasProvider,
  getProviderClass
};
