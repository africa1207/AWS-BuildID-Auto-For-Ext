/**
 * Temp-Service Provider - 自建 temp-service 临时邮箱渠道
 *
 * 来自 openaizhuce 项目约定的接口:
 * - POST   /admin/new_address            -> { jwt, address, ... }
 * - GET    /admin/mails?limit&offset&address=email -> { results: [...], count }
 * - DELETE /admin/delete_address/{id}    -> { ... }
 *
 * 认证头:
 * - x-admin-auth: <admin_auth>
 * - x-custom-auth: <custom_auth> (可选)
 */

import { MailProvider } from '../mail-provider.js';

class TempServiceProvider extends MailProvider {
  static id = 'temp-service';
  static name = 'Temp-Service';
  static needsConfig = true;
  static supportsAutoVerification = true;

  constructor(options = {}) {
    super();
    this.baseUrl = options.baseUrl || '';
    this.adminAuth = options.adminAuth || '';
    this.customAuth = options.customAuth || '';
    this.domain = options.domain || '';
    this.namePrefix = options.namePrefix || 'oc';
    this.timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 15000;

    this.jwt = null;
    this.addressId = null;
    this.processedKeys = new Set();
  }

  setConfig(config = {}) {
    if (config.baseUrl !== undefined) this.baseUrl = config.baseUrl || '';
    if (config.adminAuth !== undefined) this.adminAuth = config.adminAuth || '';
    if (config.customAuth !== undefined) this.customAuth = config.customAuth || '';
    if (config.domain !== undefined) this.domain = config.domain || '';
    if (config.namePrefix !== undefined) this.namePrefix = config.namePrefix || 'oc';
    if (config.timeoutMs !== undefined) this.timeoutMs = config.timeoutMs || 15000;
  }

  async _ensureOffscreen() {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) return;

    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Execute cross-origin requests with extension permissions'
    });
  }

  _normalizeBaseUrl() {
    let u = (this.baseUrl || '').trim();
    if (!u) return '';
    if (u.startsWith('http://')) {
      u = u.replace('http://', 'https://');
    }
    return u.replace(/\/+$/, '');
  }

  _adminHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'x-admin-auth': this.adminAuth
    };
    if (this.customAuth) {
      headers['x-custom-auth'] = this.customAuth;
    }
    return headers;
  }

  async _callApi(path, options = {}) {
    const base = this._normalizeBaseUrl();
    if (!base) throw new Error('未配置 Base URL');

    const url = base + path;

    await this._ensureOffscreen();

    const response = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_FETCH',
      url,
      options: {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body || undefined
      }
    });

    if (!response?.success) {
      throw new Error(response?.error || 'API 请求失败');
    }
    return response.data;
  }

  _randomHex(bytes = 5) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  _extractResults(payload) {
    if (Array.isArray(payload)) {
      return payload.filter(x => x && typeof x === 'object');
    }
    if (payload && typeof payload === 'object') {
      const results = payload.results;
      if (Array.isArray(results)) {
        return results.filter(x => x && typeof x === 'object');
      }
    }
    return [];
  }

  async createInbox() {
    if (!this.isConfigured()) {
      throw new Error('Temp-Service 未配置完整（Base URL / Admin Auth / Domain）');
    }

    const local = `${this.namePrefix || 'oc'}${this._randomHex(5)}`;
    const bodyObj = { enablePrefix: true, name: local, domain: this.domain };

    const data = await this._callApi('/admin/new_address', {
      method: 'POST',
      headers: this._adminHeaders(),
      body: JSON.stringify(bodyObj)
    });

    const jwt = String(data?.jwt || '').trim();
    const address = String(data?.address || `${local}@${this.domain}`).trim();
    if (!jwt || !address) {
      throw new Error('temp-service 响应缺少 jwt/address');
    }

    this.jwt = jwt;
    this.address = address;
    if (data?.id !== undefined && data?.id !== null) {
      this.addressId = Number(data.id);
    }

    this.sessionStartTime = Date.now();
    this.processedKeys.clear();

    console.log(`[TempServiceProvider] 邮箱创建成功: ${this.address}`);
    return this.address;
  }

  async _listMails(address) {
    const base = this._normalizeBaseUrl();
    const u = new URL(base + '/admin/mails');
    u.searchParams.set('limit', '20');
    u.searchParams.set('offset', '0');
    if (address) u.searchParams.set('address', address);

    await this._ensureOffscreen();
    const response = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_FETCH',
      url: u.toString(),
      options: {
        method: 'GET',
        headers: this._adminHeaders()
      }
    });

    if (!response?.success) {
      throw new Error(response?.error || 'API 请求失败');
    }
    return response.data;
  }

  async fetchVerificationCode(senderEmail, afterTimestamp, options = {}) {
    // senderEmail/afterTimestamp 由统一接口传入，此渠道按 address 拉取即可
    void senderEmail;
    void afterTimestamp;

    const {
      initialDelay = 15000,
      maxAttempts = 40,
      pollInterval = 3000
    } = options;

    if (!this.address) {
      throw new Error('邮箱未初始化');
    }

    const regex = /(?<!\d)(\d{6})(?!\d)/;

    console.log(`[TempServiceProvider] 开始获取验证码: ${this.address}`);
    await new Promise(r => setTimeout(r, initialDelay));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const payload = await this._listMails(this.address);
        const results = this._extractResults(payload);

        for (const mail of results) {
          const key = String(mail.id ?? mail.mail_id ?? mail.message_id ?? JSON.stringify(mail).slice(0, 120));
          if (this.processedKeys.has(key)) continue;
          this.processedKeys.add(key);

          const subject = String(mail.subject || '');
          const text = String(mail.text || mail.text_content || mail.intro || '');
          const html = String(mail.html || mail.html_content || '');
          const content = [subject, text, html, JSON.stringify(mail)].join('\n');

          const m = content.match(regex);
          if (m) {
            console.log(`[TempServiceProvider] 成功获取验证码: ${m[1]}`);
            return m[1];
          }
        }
      } catch (e) {
        // 忽略本轮错误，继续轮询
      }

      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, pollInterval));
      }
    }

    console.log('[TempServiceProvider] 获取验证码超时');
    return null;
  }

  async _deleteAddress(addressId) {
    const id = Number(addressId);
    if (!id || Number.isNaN(id)) throw new Error('addressId 无效');
    await this._callApi(`/admin/delete_address/${id}`, {
      method: 'DELETE',
      headers: this._adminHeaders()
    });
  }

  async _resolveAddressIdByMails() {
    try {
      const payload = await this._listMails(this.address);
      const results = this._extractResults(payload);
      if (!results.length) return null;
      const v = results[0]?.id;
      if (v === undefined || v === null) return null;
      return Number(v);
    } catch (e) {
      return null;
    }
  }

  async cleanup() {
    try {
      const addressId = this.addressId ?? (await this._resolveAddressIdByMails());
      if (addressId) {
        await this._deleteAddress(addressId);
        console.log(`[TempServiceProvider] 邮箱已删除: ${this.address} (id=${addressId})`);
      } else {
        console.warn(`[TempServiceProvider] 清理跳过：未解析到 addressId: ${this.address}`);
      }
    } catch (e) {
      console.warn('[TempServiceProvider] 清理失败:', e?.message || e);
    } finally {
      this.jwt = null;
      this.addressId = null;
      this.processedKeys.clear();
      await super.cleanup();
    }
  }

  isConfigured() {
    return !!(this.baseUrl && this.adminAuth && this.domain);
  }

  canAutoVerify() {
    return true;
  }

  getInfo() {
    return {
      ...super.getInfo(),
      baseUrl: this.baseUrl,
      adminAuth: this.adminAuth ? '******' : null,
      customAuth: this.customAuth ? '******' : null,
      domain: this.domain,
      namePrefix: this.namePrefix,
      timeoutMs: this.timeoutMs
    };
  }
}

export { TempServiceProvider };
