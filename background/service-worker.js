/**
 * Service Worker - 后台服务
 * 管理注册状态和流程控制，支持多窗口并发注册
 */

import { GmailApiClient } from '../lib/gmail-api.js';
import { createProvider } from '../lib/mail-providers/index.js';
import { DuckMailProvider } from '../lib/mail-providers/duckmail.js';
import { AWSDeviceAuth, validateToken, refreshAndValidateToken } from '../lib/oidc-api.js';
import { generatePassword, generateName } from '../lib/utils.js';
import { generateRandomFingerprint, injectFingerprint } from '../lib/fingerprint.js';

// 邮箱渠道配置
let currentMailProvider = 'gmail';  // 当前选择的渠道

// Gmail 配置
let gmailBaseAddress = '';

// Gmail API 配置
let gmailApiClient = null;
let gmailApiAuthorized = false;
let gmailSenderFilter = 'no-reply@signin.aws';  // AWS 验证码发件人

// GPTMail 配置
let gptmailApiKey = 'gpt-test';  // 默认测试 Key

// DuckMail 配置
let duckMailApiKey = '';  // 可选 API Key
let duckMailDomain = '';  // 用户选择的域名

// 授权页行为配置
let denyAccess = false;  // true=拒绝授权, false=允许授权

// 代理配置
let proxyApiUrl = '';   // 代理提取 API 地址
let proxyApiKey = '';   // 代理提取 API Key（可选）
let proxyEnabled = false; // 是否启用代理提取
let proxyManualList = []; // 手动代理列表（解析后）
let proxyManualRaw = '';  // 手动代理原始文本
let proxyRotateIndex = 0; // 轮换索引
let proxyUsageLimit = 1;  // 单个代理使用次数上限
let proxyUsageCount = 0;  // 当前代理已使用次数
let proxyDeadSet = new Set(); // 全局不可用代理集合（跨会话持久化）
let pageTimeoutMs = 300000;   // 页面无动作超时（毫秒，默认5分钟）

// IP 检测 API 全量列表
const IP_DETECT_APIS = [
  { id: 'ipinfo', label: 'ipinfo.io', url: 'https://ipinfo.io/json', parse: d => d.country ? { countryCode: d.country, timezone: d.timezone, ip: d.ip } : null },
  { id: 'ipwhois', label: 'ipwhois.app', url: 'https://ipwhois.app/json/', parse: d => d.country_code ? { countryCode: d.country_code, timezone: d.timezone, ip: d.ip } : null },
  { id: 'ipsb', label: 'api.ip.sb', url: 'https://api.ip.sb/geoip', parse: d => d.country_code ? { countryCode: d.country_code, timezone: d.timezone, ip: d.ip } : null }
];
// 启用的 API id 列表（默认全部启用）
let ipDetectEnabled = ['ipinfo', 'ipwhois', 'ipsb'];

function getEnabledIpApis() {
  if (ipDetectEnabled.length === 0) return [];
  return IP_DETECT_APIS.filter(a => ipDetectEnabled.includes(a.id));
}

// MoeMail 配置
let moemailApiUrl = 'https://';  // API 地址
let moemailApiKey = '';  // API Key
let moemailDomain = '';  // 邮箱域名后缀
let moemailPrefix = '';  // 固定前缀（可选）
let moemailRandomLength = 5;  // 随机位数
let moemailDuration = 0;  // 有效期（0=永久）

// ============== 辅助函数 ==============

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['DOM_PARSER'],
    justification: 'Execute cross-origin requests with extension permissions'
  });
}

async function detectGeoByIp() {
  const apis = getEnabledIpApis();
  if (apis.length === 0) return null;
  await ensureOffscreen();
  for (const api of apis) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'OFFSCREEN_FETCH',
        url: api.url,
        options: { method: 'GET' }
      });
      if (response?.success && response.data) {
        const result = api.parse(response.data);
        if (result) {
          console.log(`[Service Worker] IP 定位成功 (${api.url}):`, result);
          return result;
        }
      }
    } catch (e) {
      console.warn(`[Service Worker] IP 定位失败 (${api.url}):`, e.message);
    }
  }
  return null;
}

/**
 * 解析代理字符串为结构化对象
 * 支持格式: protocol://host:port, protocol://user:pass@host:port, host:port
 */
function parseProxy(str) {
  str = str.trim();
  if (!str) return null;

  let scheme = 'http', host, port, username, password;

  // 提取协议
  const protoMatch = str.match(/^(https?|socks[45]):\/\//i);
  if (protoMatch) {
    scheme = protoMatch[1].toLowerCase();
    str = str.slice(protoMatch[0].length);
  }

  // 提取认证信息
  const atIdx = str.lastIndexOf('@');
  if (atIdx !== -1) {
    const auth = str.slice(0, atIdx);
    str = str.slice(atIdx + 1);
    const colonIdx = auth.indexOf(':');
    if (colonIdx !== -1) {
      username = auth.slice(0, colonIdx);
      password = auth.slice(colonIdx + 1);
    }
  }

  // 提取 host:port
  const parts = str.split(':');
  if (parts.length < 2) return null;
  host = parts[0];
  port = parseInt(parts[1]);
  if (!host || isNaN(port)) return null;

  return { scheme, host, port, username, password };
}

/**
 * 解析代理文本（多行）为代理列表
 */
function parseProxyList(raw) {
  return raw.split(/[\n,;]+/).map(parseProxy).filter(Boolean);
}

/**
 * 获取下一个轮换代理（跳过已标记不可用的，支持单代理多次使用）
 * @param {Set} deadSet - 已标记不可用的代理 key 集合
 */
function getNextProxy(deadSet) {
  if (proxyManualList.length === 0) return null;
  const total = proxyManualList.length;

  // 当前代理未用满次数，继续使用
  if (proxyUsageCount < proxyUsageLimit && proxyRotateIndex > 0) {
    const currentIdx = (proxyRotateIndex - 1) % total;
    const proxy = proxyManualList[currentIdx];
    const key = `${proxy.scheme}://${proxy.host}:${proxy.port}`;
    if (!deadSet || !deadSet.has(key)) {
      proxyUsageCount++;
      return proxy;
    }
  }

  // 轮换到下一个可用代理
  for (let i = 0; i < total; i++) {
    const proxy = proxyManualList[proxyRotateIndex % total];
    proxyRotateIndex++;
    const key = `${proxy.scheme}://${proxy.host}:${proxy.port}`;
    if (deadSet && deadSet.has(key)) continue;
    proxyUsageCount = 1;
    return proxy;
  }
  return null;
}

/**
 * 设置无痕窗口代理
 */
function applyProxyToIncognito(proxy) {
  if (!proxy) {
    chrome.proxy.settings.clear({ scope: 'incognito_session_only' });
    return;
  }

  const scheme = proxy.scheme === 'socks4' ? 'socks4' :
                 proxy.scheme === 'socks5' ? 'socks5' :
                 proxy.scheme === 'https' ? 'https' : 'http';

  const config = {
    mode: 'fixed_servers',
    rules: {
      singleProxy: {
        scheme,
        host: proxy.host,
        port: proxy.port
      }
    }
  };

  chrome.proxy.settings.set({
    value: config,
    scope: 'incognito_session_only'
  });

  // 处理代理认证
  if (proxy.username && proxy.password) {
    chrome.webRequest?.onAuthRequired?.addListener?.(
      (details, callback) => {
        callback({ authCredentials: { username: proxy.username, password: proxy.password } });
      },
      { urls: ['<all_urls>'] },
      ['asyncBlocking']
    );
  }

  console.log(`[Service Worker] 已设置无痕代理: ${scheme}://${proxy.host}:${proxy.port}`);
}

/**
 * 清除无痕窗口代理
 */
function clearIncognitoProxy() {
  chrome.proxy.settings.clear({ scope: 'incognito_session_only' });
  console.log('[Service Worker] 已清除无痕代理');
}

/**
 * 标记代理为不可用（持久化）
 */
function markProxyDead(proxyKey) {
  proxyDeadSet.add(proxyKey);
  chrome.storage.local.set({ proxyDeadList: [...proxyDeadSet] });
  broadcastState();
}

/**
 * 从不可用列表中移除单个代理
 */
function reviveProxy(proxyKey) {
  proxyDeadSet.delete(proxyKey);
  chrome.storage.local.set({ proxyDeadList: [...proxyDeadSet] });
  broadcastState();
}

/**
 * 清空所有不可用代理
 */
function clearDeadProxies() {
  proxyDeadSet.clear();
  chrome.storage.local.set({ proxyDeadList: [] });
  broadcastState();
}

// ============== 全局状态 ==============

// 主状态
let globalState = {
  status: 'idle', // idle, running, completed, error
  step: '',
  error: null,
  totalTarget: 0,      // 目标注册数
  totalRegistered: 0,  // 已成功注册数
  totalFailed: 0,      // 失败数
  concurrency: 1,      // 并发数
  lastSuccess: null    // 最后一个成功的记录
};

// 并发会话
let sessions = new Map(); // sessionId -> session
let sessionIdCounter = 0;

// 任务队列
let taskQueue = [];
let isRunning = false;
let shouldStop = false;

// 注册历史记录
let registrationHistory = [];

// 窗口创建锁，防止同时创建多个窗口
let windowCreationLock = Promise.resolve();

// API 调用锁，防止同时调用 AWS/Mail API
let apiCallLock = Promise.resolve();

// ============== 工具函数 ==============

/**
 * 生成唯一会话 ID
 */
function generateSessionId() {
  return `session_${++sessionIdCounter}_${Date.now()}`;
}

/**
 * 等待标签页加载完成
 */
function waitForTabLoad(tabId, timeout = 30000, expectedUrl = null) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkTab = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        console.log(`[waitForTabLoad] tabId=${tabId}, status=${tab.status}, url=${tab.url}`);

        if (tab.status === 'complete') {
          // 如果指定了期望 URL，确保当前 URL 匹配
          if (expectedUrl && tab.url && !tab.url.startsWith(expectedUrl)) {
            // URL 还没切换，继续等待
          } else {
            resolve(tab);
            return;
          }
        }
      } catch (e) {
        console.error(`[waitForTabLoad] tabId=${tabId} 获取失败:`, e);
        reject(new Error('标签页已关闭或不存在'));
        return;
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error('等待页面加载超时'));
        return;
      }

      setTimeout(checkTab, 500);
    };

    checkTab();
  });
}

/**
 * 更新状态并通知 popup
 */
function broadcastState() {
  const state = getPublicState();
  chrome.runtime.sendMessage({
    type: 'STATE_UPDATE',
    state
  }).catch(() => {
    // popup 可能未打开，忽略错误
  });
}

/**
 * 获取可以发送给 popup 的公开状态
 */
function getPublicState() {
  return {
    status: globalState.status,
    step: globalState.step,
    error: globalState.error,
    totalTarget: globalState.totalTarget,
    totalRegistered: globalState.totalRegistered,
    totalFailed: globalState.totalFailed,
    lastSuccess: globalState.lastSuccess,
    sessions: Array.from(sessions.values()).map(s => ({
      id: s.id,
      status: s.status,
      step: s.step,
      email: s.email,
      error: s.error
    })),
    history: registrationHistory
  };
}

/**
 * 更新全局状态
 */
function updateGlobalState(updates) {
  globalState = { ...globalState, ...updates };
  broadcastState();
}

/**
 * 更新会话状态
 */
function updateSession(sessionId, updates) {
  const session = sessions.get(sessionId);
  if (session) {
    Object.assign(session, updates);
    broadcastState();
  }
}

// ============== 会话管理 ==============

/**
 * 创建新会话
 */
function createSession() {
  const sessionId = generateSessionId();
  const session = {
    id: sessionId,
    status: 'pending', // pending, running, polling_token, completed, error
    step: '等待中...',
    error: null,
    // 账号信息
    email: null,
    password: null,
    firstName: null,
    lastName: null,
    // 邮箱渠道 Provider
    mailProvider: null,
    // 兼容旧代码
    mailClient: null,
    mailAccessKey: null,
    // OIDC 客户端
    oidcClient: null,
    oidcAuth: null,
    // 窗口信息
    windowId: null,
    tabId: null,
    // Token 结果
    token: null,
    // 轮询控制
    pollAbort: false,
    // 页面被阻止标志 (403)
    pageBlocked: false,
    // 会话开始时间（用于过滤验证码邮件）
    startTime: Date.now(),
    // 验证码
    verificationCode: null
  };
  sessions.set(sessionId, session);
  return session;
}

/**
 * 销毁会话
 */
async function destroySession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  // 关闭窗口
  if (session.windowId) {
    try {
      await chrome.windows.remove(session.windowId);
    } catch (e) {
      // 窗口可能已关闭
    }
  }

  // Gmail 别名模式不需要删除邮箱
  session.mailClient = null;

  sessions.delete(sessionId);
}

/**
 * 关闭所有会话
 */
async function closeAllSessions() {
  const promises = Array.from(sessions.keys()).map(id => destroySession(id));
  await Promise.all(promises);
  sessions.clear();
}

// ============== 注册流程 ==============

/**
 * 带锁的 API 调用，防止并发请求导致限流
 */
async function withApiLock(fn) {
  await apiCallLock;
  let releaseLock;
  apiCallLock = new Promise(resolve => { releaseLock = resolve; });
  try {
    return await fn();
  } finally {
    // API 调用后延迟一小段时间再释放锁
    await new Promise(resolve => setTimeout(resolve, 500));
    releaseLock();
  }
}

/**
 * 单个会话的注册流程
 */
async function runSessionRegistration(session) {
  try {
    // 步骤 1: 生成账号信息
    updateSession(session.id, { step: '生成账号信息...' });
    const { firstName, lastName } = generateName();
    const password = generatePassword();

    session.firstName = firstName;
    session.lastName = lastName;
    session.password = password;
    session.startTime = Date.now();

    console.log(`[Session ${session.id}] 生成账号信息:`, { firstName, lastName });

    // 步骤 2: 创建邮箱
    updateSession(session.id, { step: '创建邮箱...' });

    // 创建对应渠道的 provider
    const providerOptions = {};
    if (currentMailProvider === 'gmail') {
      if (!gmailBaseAddress) {
        throw new Error('未配置 Gmail 地址，请在插件设置中配置');
      }
      providerOptions.baseEmail = gmailBaseAddress;
      providerOptions.senderFilter = gmailSenderFilter;
    } else if (currentMailProvider === 'gptmail') {
      providerOptions.apiKey = gptmailApiKey;
    } else if (currentMailProvider === 'duckmail') {
      providerOptions.apiKey = duckMailApiKey;
      providerOptions.domain = duckMailDomain;
    } else if (currentMailProvider === 'moemail') {
      providerOptions.apiUrl = moemailApiUrl;
      providerOptions.apiKey = moemailApiKey;
      providerOptions.domain = moemailDomain;
      providerOptions.prefix = moemailPrefix;
      providerOptions.randomLength = moemailRandomLength;
      providerOptions.duration = moemailDuration;
    }

    session.mailProvider = createProvider(currentMailProvider, providerOptions);

    // Gmail 渠道需要设置 API 授权状态
    if (currentMailProvider === 'gmail' && gmailApiAuthorized && gmailApiClient) {
      session.mailProvider.apiClient = gmailApiClient;
      session.mailProvider.apiAuthorized = true;
    }

    // 创建邮箱
    const email = await session.mailProvider.createInbox();
    session.email = email;
    session.manualVerification = !session.mailProvider.canAutoVerify?.();
    updateSession(session.id, { email });

    console.log(`[Session ${session.id}] 账号信息:`, { email, firstName, lastName, provider: currentMailProvider });

    // 步骤 3: 获取 OIDC 授权 URL（使用 API 锁）
    updateSession(session.id, { step: '获取授权链接...' });
    session.oidcClient = new AWSDeviceAuth();
    const authInfo = await withApiLock(() => session.oidcClient.quickAuth());
    session.oidcAuth = authInfo;

    console.log(`[Session ${session.id}] OIDC 授权信息:`, authInfo.verificationUriComplete);

    // 步骤 4: 确定代理 & 检测 IP 地理位置 & 生成指纹
    let geoInfo = null;
    let pendingProxy = null;
    let fingerprint = null;
    const useProxy = proxyEnabled && proxyManualList.length > 0;

    // 无代理模式：直接检测 IP → 生成指纹
    if (!useProxy) {
      updateSession(session.id, { step: '检测 IP 地理位置...' });
      try {
        geoInfo = await detectGeoByIp();
        if (geoInfo) {
          console.log(`[Session ${session.id}] 直连 IP 地理位置: country=${geoInfo.countryCode}, timezone=${geoInfo.timezone}, ip=${geoInfo.ip}`);
        } else {
          console.warn(`[Session ${session.id}] IP 定位返回空，将使用纯随机指纹`);
        }
      } catch (e) {
        console.warn(`[Session ${session.id}] IP 定位失败: ${e.message}，将使用纯随机指纹`);
      }
      updateSession(session.id, { step: '生成随机指纹...' });
      fingerprint = generateRandomFingerprint(geoInfo);
      session.fingerprint = fingerprint;
      console.log(`[Session ${session.id}] 指纹已生成: language=${fingerprint.languages[0]}, timezone=${fingerprint.timezone}, screen=${fingerprint.screen.width}x${fingerprint.screen.height}, ua=${fingerprint.userAgent.substring(0, 60)}...`);
    }

    // 步骤 5: 打开无痕窗口 → 设置代理 → 加载页面（支持代理失败重试）
    const maxProxyRetries = useProxy ? 3 : 1;
    let pageLoaded = false;

    for (let retryRound = 0; retryRound < maxProxyRetries; retryRound++) {
      if (retryRound > 0) {
        console.log(`[Session ${session.id}] 第 ${retryRound + 1} 次重试，更换代理重新加载...`);
        updateSession(session.id, { step: `更换代理重试 (${retryRound + 1}/${maxProxyRetries})...` });
        // 关闭上一轮的窗口
        if (session.windowId) {
          try { await chrome.windows.remove(session.windowId); } catch (e) { /* ignore */ }
          session.windowId = null;
          session.tabId = null;
        }
        clearIncognitoProxy();
        // 重置代理相关状态
        pendingProxy = null;
        geoInfo = null;
        fingerprint = null;
      }

    updateSession(session.id, { step: '打开无痕窗口...' });

    await windowCreationLock;
    let releaseLock;
    windowCreationLock = new Promise(resolve => { releaseLock = resolve; });

    try {
      // 代理模式：先开 IP 检测页创建无痕窗口
      const enabledApis = getEnabledIpApis();
      const initialUrl = (useProxy && enabledApis.length > 0) ? enabledApis[0].url : authInfo.verificationUriComplete;
      console.log(`[Session ${session.id}] 准备创建无痕窗口，URL:`, initialUrl);

      const window = await chrome.windows.create({
        url: initialUrl,
        incognito: true,
        focused: true,
        width: 600,
        height: 800
      });

      console.log(`[Session ${session.id}] chrome.windows.create 返回值:`, window);
      console.log(`[Session ${session.id}] window 类型:`, typeof window);
      console.log(`[Session ${session.id}] window.id:`, window?.id);
      console.log(`[Session ${session.id}] window.tabs:`, window?.tabs);

      // 检查窗口和标签页
      if (!window) {
        throw new Error('chrome.windows.create 返回 null/undefined，可能缺少权限或无痕模式未启用');
      }

      if (!window.id) {
        throw new Error(`窗口对象缺少 id 属性，返回值: ${JSON.stringify(window)}`);
      }

      if (!window.tabs || window.tabs.length === 0) {
        throw new Error(`窗口缺少标签页，windowId=${window.id}`);
      }

      session.windowId = window.id;
      session.tabId = window.tabs[0].id;
      console.log(`[Session ${session.id}] 无痕窗口创建成功: windowId=${window.id}, tabId=${session.tabId}`);

      // 代理模式：循环尝试代理，检测连通性，不通则跳过
      if (useProxy) {
        const maxAttempts = proxyManualList.length;
        let proxyConnected = false;

        const ipApis = getEnabledIpApis();

        if (ipApis.length === 0) {
          // 未启用任何 IP 检测 API，直接使用代理不检测
          pendingProxy = getNextProxy(proxyDeadSet);
          if (pendingProxy) {
            const proxyKey = `${pendingProxy.scheme}://${pendingProxy.host}:${pendingProxy.port}`;
            applyProxyToIncognito(pendingProxy);
            session.proxy = pendingProxy;
            proxyConnected = true;
            console.log(`[Session ${session.id}] 使用代理(跳过连通检测): ${proxyKey}`);
          }
        } else {

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          pendingProxy = getNextProxy(proxyDeadSet);
          if (!pendingProxy) break;

          const proxyKey = `${pendingProxy.scheme}://${pendingProxy.host}:${pendingProxy.port}`;
          updateSession(session.id, { step: `测试代理 (${attempt + 1}/${maxAttempts}): ${proxyKey}` });
          console.log(`[Session ${session.id}] 测试代理 [${attempt + 1}/${maxAttempts}]: ${proxyKey}`);

          applyProxyToIncognito(pendingProxy);

          // 依次尝试 IP 检测 API 验证代理连通性
          let connected = false;
          for (const api of ipApis) {
            try {
              await chrome.tabs.update(session.tabId, { url: api.url });
              await waitForTabLoad(session.tabId, 10000, api.url);
              // 等待 DOM 完全就绪
              await new Promise(r => setTimeout(r, 500));
              const [result] = await chrome.scripting.executeScript({
                target: { tabId: session.tabId },
                func: () => {
                  try {
                    // 优先取 pre 标签内容（浏览器常把 JSON 包在 pre 里），否则取 body
                    const text = (document.querySelector('pre') || document.body).innerText.trim();
                    return JSON.parse(text);
                  } catch (e) { return null; }
                }
              });
              const parsed = result?.result ? api.parse(result.result) : null;
              if (parsed) {
                geoInfo = parsed;
                console.log(`[Session ${session.id}] 代理连通 [${proxyKey}]: country=${geoInfo.countryCode}, timezone=${geoInfo.timezone}, ip=${geoInfo.ip} (via ${api.url})`);
                connected = true;
                break;
              }
            } catch (e) {
              // 该 API 失败，尝试下一个
            }
          }

          if (connected) {
            proxyConnected = true;
            session.proxy = pendingProxy;
            console.log(`[Session ${session.id}] 使用代理: ${proxyKey}`);
            break;
          } else {
            console.warn(`[Session ${session.id}] 代理不可用: ${proxyKey}，跳过`);
            markProxyDead(proxyKey);
          }
        }
        } // end if ipApis.length > 0

        if (!proxyConnected) {
          console.warn(`[Session ${session.id}] 所有代理均不可用 (${proxyDeadSet.size} 个)，切换为直连模式`);
          pendingProxy = null;
          clearIncognitoProxy();
        }

        // 生成指纹
        updateSession(session.id, { step: '生成随机指纹...' });
        if (geoInfo) {
          console.log(`[Session ${session.id}] 基于代理 IP 生成指纹: country=${geoInfo.countryCode}, timezone=${geoInfo.timezone}, ip=${geoInfo.ip}`);
        } else {
          console.warn(`[Session ${session.id}] 无 geoInfo，使用纯随机指纹`);
        }
        fingerprint = generateRandomFingerprint(geoInfo);
        session.fingerprint = fingerprint;
        console.log(`[Session ${session.id}] 指纹已生成: language=${fingerprint.languages[0]}, timezone=${fingerprint.timezone}, screen=${fingerprint.screen.width}x${fingerprint.screen.height}, ua=${fingerprint.userAgent.substring(0, 60)}...`);

        // 导航到目标授权 URL
        updateSession(session.id, { step: '导航到授权页...' });
        console.log(`[Session ${session.id}] 导航到授权页: ${authInfo.verificationUriComplete}`);
        await chrome.tabs.update(session.tabId, { url: authInfo.verificationUriComplete });
      }

      // 等待页面加载完成
      updateSession(session.id, { step: '等待页面加载...' });
      let loadTimeout = false;
      try {
        await waitForTabLoad(session.tabId, pageTimeoutMs);
        console.log(`[Session ${session.id}] 页面已加载`);
      } catch (e) {
        console.warn(`[Session ${session.id}] 等待页面加载: ${e.message}`);
        loadTimeout = true;
      }

      // 代理模式下页面加载超时 → 标记当前代理为不可用，换代理重试
      if (loadTimeout && useProxy && retryRound < maxProxyRetries - 1) {
        if (pendingProxy) {
          const failedKey = `${pendingProxy.scheme}://${pendingProxy.host}:${pendingProxy.port}`;
          markProxyDead(failedKey);
          console.warn(`[Session ${session.id}] 页面加载超时，标记代理 ${failedKey} 不可用，将更换代理重试`);
        }
        continue;
      }

      // 注入随机指纹脚本
      updateSession(session.id, { step: '注入随机指纹...' });
      try {
        await chrome.scripting.executeScript({
          target: { tabId: session.tabId },
          func: injectFingerprint,
          args: [fingerprint],
          world: 'MAIN'
        });
        console.log(`[Session ${session.id}] 随机指纹注入成功`);
      } catch (error) {
        console.warn(`[Session ${session.id}] 指纹注入失败:`, error.message);
      }

      // 额外等待一小段时间让 content script 初始化
      await new Promise(resolve => setTimeout(resolve, 1000));
      pageLoaded = true;

    } catch (error) {
      console.error(`[Session ${session.id}] 创建无痕窗口错误:`, error);

      // 根据错误类型给出详细提示
      let errorMsg = '创建无痕窗口失败';

      if (error.message && error.message.includes('cannot be created')) {
        errorMsg = '无法创建无痕窗口，请在扩展设置中启用"在无痕模式下允许"';
      } else if (error.message && (error.message.includes('null/undefined') || error.message.includes('缺少权限'))) {
        errorMsg = '创建窗口失败：请检查扩展权限，重新加载扩展后重试';
      } else if (error.message) {
        errorMsg = error.message;
      }

      releaseLock();
      throw new Error(errorMsg);
    } finally {
      // 释放窗口创建锁（多次调用无害）
      releaseLock();
    }

    // 加载成功，进入 Token 轮询
    // 步骤 6: 轮询 Token（在重试循环内，以便 403 时换代理重试）
    session.status = 'polling_token';
    session.pageBlocked = false; // 重置标志
    updateSession(session.id, { step: '自动填表中...' });

    const tokenResult = await pollSessionToken(session);

    // 页面被阻止 (403)，换代理重试
    if (tokenResult === 'PAGE_BLOCKED' && useProxy && retryRound < maxProxyRetries - 1) {
      if (pendingProxy) {
        const failedKey = `${pendingProxy.scheme}://${pendingProxy.host}:${pendingProxy.port}`;
        markProxyDead(failedKey);
        console.warn(`[Session ${session.id}] 页面 403，标记代理 ${failedKey} 不可用，将更换代理重试`);
      }
      continue;
    }

    if (tokenResult && tokenResult !== 'PAGE_BLOCKED') {
      // 成功
      session.status = 'completed';
      session.token = tokenResult;
      updateSession(session.id, { step: '注册成功!' });

      // 保存到历史
      saveToHistory(session, true);

      // 更新全局状态
      globalState.totalRegistered++;
      globalState.lastSuccess = {
        email: session.email,
        password: session.password,
        firstName: session.firstName,
        lastName: session.lastName,
        token: {
          ...tokenResult,
          clientId: session.oidcAuth?.clientId || '',
          clientSecret: session.oidcAuth?.clientSecret || ''
        }
      };

      return true;
    } else {
      throw new Error(tokenResult === 'PAGE_BLOCKED' ? '页面被阻止 (403)，代理均不可用' : 'Token 获取超时或被中断');
    }

    } // end for retryRound

  } catch (error) {
    console.error(`[Session ${session.id}] 注册失败:`, error);
    session.status = 'error';
    session.error = error.message;
    updateSession(session.id, { step: '失败: ' + error.message });

    saveToHistory(session, false);
    globalState.totalFailed++;

    return false;
  } finally {
    // 关闭窗口
    if (session.windowId) {
      try {
        await chrome.windows.remove(session.windowId);
        session.windowId = null;
      } catch (e) {
        // 忽略
      }
    }

    // 清理邮箱 provider
    if (session.mailProvider) {
      try {
        await session.mailProvider.cleanup();
      } catch (e) {
        // 忽略
      }
      session.mailProvider = null;
    }
    session.mailClient = null;
  }
}

/**
 * 轮询获取 Token
 */
async function pollSessionToken(session) {
  if (!session.oidcClient) return null;

  const startTime = Date.now();
  const timeout = 600000; // Token 轮询固定 10 分钟超时
  const pollInterval = Math.max(session.oidcClient.interval * 1000, 2000);

  // pageBlocked 中断 Promise
  let resolveBlocked;
  const blockedPromise = new Promise(r => { resolveBlocked = r; });
  const checkBlocked = setInterval(() => {
    if (session.pageBlocked) {
      resolveBlocked('PAGE_BLOCKED');
    }
  }, 500);

  // 无进度超时检测
  let lastStep = session.step;
  let lastStepChangeTime = Date.now();

  try {
    while (!session.pollAbort && !shouldStop && Date.now() - startTime < timeout) {
      // 检测 step 是否有变化
      if (session.step !== lastStep) {
        lastStep = session.step;
        lastStepChangeTime = Date.now();
      } else if (Date.now() - lastStepChangeTime > pageTimeoutMs) {
        console.warn(`[Session ${session.id}] 页面无动作超时 (${pageTimeoutMs / 1000}s)，step 停留在: ${lastStep}`);
        return null;
      }

      try {
        // 用 Promise.race 让 pageBlocked 能立即中断 getToken
        const raceResult = await Promise.race([
          session.oidcClient.getToken(),
          blockedPromise
        ]);
        if (raceResult === 'PAGE_BLOCKED') {
          console.warn(`[Session ${session.id}] 页面被阻止 (403)，中断 Token 轮询`);
          return 'PAGE_BLOCKED';
        }
        if (raceResult) {
          console.log(`[Session ${session.id}] Token 获取成功`);
          return raceResult;
        }
      } catch (error) {
        if (!error.message.includes('authorization_pending')) {
          console.error(`[Session ${session.id}] Token 轮询错误:`, error);
        }
      }

      // sleep 也用 race，让 pageBlocked 能中断等待
      const sleepResult = await Promise.race([
        new Promise(resolve => setTimeout(() => resolve(null), pollInterval)),
        blockedPromise
      ]);
      if (sleepResult === 'PAGE_BLOCKED') {
        console.warn(`[Session ${session.id}] 页面被阻止 (403)，中断 Token 轮询`);
        return 'PAGE_BLOCKED';
      }
    }

    return null;
  } finally {
    clearInterval(checkBlocked);
  }
}

/**
 * 保存注册结果到历史
 */
function saveToHistory(session, success) {
  let tokenInfo = null;
  if (success && session.token) {
    tokenInfo = {
      ...session.token,
      clientId: session.oidcAuth?.clientId || '',
      clientSecret: session.oidcAuth?.clientSecret || ''
    };
  }

  const record = {
    id: Date.now() + Math.random(),
    time: new Date().toLocaleString(),
    email: session.email,
    password: session.password,
    firstName: session.firstName,
    lastName: session.lastName,
    success: success,
    error: success ? null : session.error,
    token: tokenInfo,
    tokenStatus: success ? 'unknown' : null // unknown, valid, invalid, suspended
  };

  registrationHistory.unshift(record);

  // 只保留最近 100 条记录
  if (registrationHistory.length > 100) {
    registrationHistory = registrationHistory.slice(0, 100);
  }

  // 保存到 storage
  chrome.storage.local.set({ registrationHistory });
}

/**
 * 批量验证所有 Token（并发执行，带进度）
 */
async function validateAllTokens() {
  const results = {
    total: 0,
    valid: 0,
    expired: 0,
    suspended: 0,
    invalid: 0,
    error: 0,
    details: []
  };

  const recordsToValidate = registrationHistory.filter(r => r.success && r.token?.refreshToken);
  results.total = recordsToValidate.length;

  if (results.total === 0) {
    return results;
  }

  // 并发验证（每批 5 个）
  const concurrency = 5;
  let validated = 0;

  // 通知开始验证
  chrome.runtime.sendMessage({
    type: 'VALIDATION_PROGRESS',
    progress: { validated: 0, total: results.total }
  }).catch(() => {});

  for (let i = 0; i < recordsToValidate.length; i += concurrency) {
    const batch = recordsToValidate.slice(i, i + concurrency);

    // 并发执行当前批次
    const batchResults = await Promise.allSettled(
      batch.map(async (record) => {
        try {
          // 使用刷新并验证的方法
          const result = await refreshAndValidateToken({
            clientId: record.token.clientId,
            clientSecret: record.token.clientSecret,
            refreshToken: record.token.refreshToken
          });

          // 更新记录的 token 状态
          record.tokenStatus = result.status;

          // 如果刷新成功，更新 token
          if (result.newAccessToken) {
            record.token.accessToken = result.newAccessToken;
            record.token.refreshToken = result.newRefreshToken;
          }

          return { record, result };
        } catch (error) {
          record.tokenStatus = 'error';
          return { record, result: { status: 'error', error: error.message } };
        }
      })
    );

    // 统计结果
    for (const promiseResult of batchResults) {
      if (promiseResult.status === 'fulfilled') {
        const { result } = promiseResult.value;
        
        switch (result.status) {
          case 'valid':
            results.valid++;
            break;
          case 'suspended':
            results.suspended++;
            results.details.push({ 
              email: promiseResult.value.record.email, 
              status: 'suspended', 
              error: result.error 
            });
            break;
          case 'expired':
            results.expired++;
            results.details.push({ 
              email: promiseResult.value.record.email, 
              status: 'expired', 
              error: result.error 
            });
            break;
          case 'invalid':
            results.invalid++;
            results.details.push({ 
              email: promiseResult.value.record.email, 
              status: 'invalid', 
              error: result.error 
            });
            break;
          case 'error':
            results.error++;
            results.details.push({ 
              email: promiseResult.value.record.email, 
              status: 'error', 
              error: result.error 
            });
            break;
        }
      } else {
        results.error++;
      }

      validated++;
    }

    // 通知进度更新
    chrome.runtime.sendMessage({
      type: 'VALIDATION_PROGRESS',
      progress: { validated, total: results.total }
    }).catch(() => {});

    // 批次间延迟，避免限流
    if (i + concurrency < recordsToValidate.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // 保存更新后的状态
  chrome.storage.local.set({ registrationHistory });
  broadcastState();

  return results;
}

// ============== 批量注册控制 ==============

/**
 * 开始批量注册
 */
async function startBatchRegistration(loopCount, concurrency, provider, gmailAddress) {
  if (isRunning) {
    return { success: false, error: '已有注册任务在运行' };
  }

  // 设置渠道
  currentMailProvider = provider || 'gmail';

  // 根据渠道检查配置
  if (currentMailProvider === 'gmail') {
    if (!gmailAddress) {
      return { success: false, error: '未配置 Gmail 地址' };
    }
    gmailBaseAddress = gmailAddress;
  } else if (currentMailProvider === 'duckmail') {
    if (!duckMailDomain) {
      return { success: false, error: '未选择 DuckMail 域名' };
    }
  }

  isRunning = true;
  shouldStop = false;

  // 重置状态
  globalState = {
    status: 'running',
    step: '开始注册...',
    error: null,
    totalTarget: loopCount,
    totalRegistered: 0,
    totalFailed: 0,
    concurrency: concurrency,
    lastSuccess: null
  };

  sessions.clear();
  broadcastState();

  console.log(`[Service Worker] 开始批量注册: 目标=${loopCount}, 并发=${concurrency}, 渠道=${currentMailProvider}`);

  // 创建任务队列
  taskQueue = [];
  for (let i = 0; i < loopCount; i++) {
    taskQueue.push(i);
  }

  // 并发执行
  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(runWorker(i));
  }

  await Promise.all(workers);

  // 完成
  isRunning = false;
  globalState.status = shouldStop ? 'idle' : 'completed';
  globalState.step = shouldStop
    ? `已停止，成功 ${globalState.totalRegistered} 个`
    : `完成！成功 ${globalState.totalRegistered}/${loopCount} 个`;

  broadcastState();

  return { success: true, state: getPublicState() };
}

/**
 * 工作线程 - 从队列取任务执行
 */
async function runWorker(workerId) {
  console.log(`[Worker ${workerId}] 启动`);

  // 错开启动时间，避免同时创建窗口和调用 API
  // 第一个 worker 立即启动，后续 worker 等待更长时间
  if (workerId > 0) {
    await new Promise(resolve => setTimeout(resolve, workerId * 3000));
  }

  while (!shouldStop && taskQueue.length > 0) {
    const taskIndex = taskQueue.shift();
    if (taskIndex === undefined) break;

    console.log(`[Worker ${workerId}] 执行任务 #${taskIndex + 1}`);

    // 清理已完成的旧会话，只保留活跃的
    for (const [id, s] of sessions) {
      if (s.status === 'completed' || s.status === 'error') {
        sessions.delete(id);
      }
    }

    // 创建会话
    const session = createSession();

    const done = globalState.totalRegistered + globalState.totalFailed;
    updateGlobalState({
      step: `进度 ${done}/${globalState.totalTarget}，正在注册第 ${taskIndex + 1} 个...`
    });

    // 执行注册
    await runSessionRegistration(session);

    // 更新全局进度
    const doneAfter = globalState.totalRegistered + globalState.totalFailed;
    updateGlobalState({
      step: `进度 ${doneAfter}/${globalState.totalTarget}`
    });

    // 任务间延迟
    if (!shouldStop && taskQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`[Worker ${workerId}] 结束`);
}

/**
 * 停止注册
 */
function stopRegistration() {
  console.log('[Service Worker] 停止注册');
  shouldStop = true;
  taskQueue = [];

  // 中断所有会话的轮询
  for (const session of sessions.values()) {
    session.pollAbort = true;
  }

  updateGlobalState({ step: '正在停止...' });
}

/**
 * 完全重置状态
 */
async function resetState() {
  shouldStop = true;
  taskQueue = [];
  isRunning = false;

  await closeAllSessions();

  globalState = {
    status: 'idle',
    step: '',
    error: null,
    totalTarget: 0,
    totalRegistered: 0,
    totalFailed: 0,
    concurrency: 1,
    lastSuccess: null
  };

  broadcastState();
}

// ============== 消息处理 ==============

/**
 * 根据 windowId 查找对应的会话（主要方式）
 * windowId 在整个认证流程中保持不变，比 tabId 更可靠
 */
function findSessionByWindowId(windowId) {
  for (const session of sessions.values()) {
    if (session.windowId === windowId) {
      return session;
    }
  }
  return null;
}

/**
 * 获取验证码（使用 provider 自动获取，否则手动输入）
 */
async function getVerificationCode(session) {
  if (!session) {
    return { success: false, error: '会话未初始化' };
  }

  // 如果会话中已经有验证码（用户已输入或已获取），则返回
  if (session.verificationCode) {
    return { success: true, code: session.verificationCode };
  }

  // 使用 provider 获取验证码
  if (session.mailProvider) {
    try {
      console.log(`[Session ${session.id}] 使用 ${currentMailProvider} provider 获取验证码...`);

      const afterTimestamp = session.startTime || Date.now() - 300000;

      const code = await session.mailProvider.fetchVerificationCode(
        gmailSenderFilter,
        afterTimestamp,
        {
          initialDelay: currentMailProvider === 'guerrilla' ? 15000 : 20000,
          maxAttempts: 15,
          pollInterval: currentMailProvider === 'guerrilla' ? 4000 : 5000
        }
      );

      if (code) {
        console.log(`[Session ${session.id}] 成功获取验证码: ${code}`);
        session.verificationCode = code;
        return { success: true, code };
      }

      // 超时，回退到手动模式
      console.log(`[Session ${session.id}] 获取验证码超时，回退到手动模式`);
      return {
        success: false,
        needManualInput: true,
        error: '自动获取验证码超时，请手动填写'
      };
    } catch (error) {
      console.error(`[Session ${session.id}] 获取验证码失败:`, error);
      return {
        success: false,
        needManualInput: true,
        error: `自动获取失败: ${error.message}，请手动填写`
      };
    }
  }

  // 兼容旧逻辑：Gmail API 直接获取
  if (gmailApiAuthorized && gmailApiClient) {
    try {
      console.log(`[Session ${session.id}] 使用 Gmail API 自动获取验证码...`);

      const afterTimestamp = session.startTime || Date.now() - 300000;

      const code = await gmailApiClient.fetchVerificationCode(
        gmailSenderFilter,
        afterTimestamp,
        {
          initialDelay: 20000,
          maxAttempts: 12,
          pollInterval: 5000
        }
      );

      if (code) {
        console.log(`[Session ${session.id}] Gmail API 成功获取验证码: ${code}`);
        session.verificationCode = code;
        return { success: true, code };
      }

      console.log(`[Session ${session.id}] Gmail API 获取验证码超时，回退到手动模式`);
      return {
        success: false,
        needManualInput: true,
        error: '自动获取验证码超时，请手动填写'
      };
    } catch (error) {
      console.error(`[Session ${session.id}] Gmail API 获取验证码失败:`, error);
      return {
        success: false,
        needManualInput: true,
        error: `自动获取失败: ${error.message}，请手动填写`
      };
    }
  }

  // 需要用户手动输入验证码
  console.log(`[Session ${session.id}] 无法自动获取验证码，等待用户手动输入`);

  return {
    success: false,
    needManualInput: true,
    error: '请从邮箱获取验证码并手动填写'
  };
}

/**
 * 处理来自 popup 和 content script 的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 用 windowId 查找会话（跨域导航时 tabId 可能变化，windowId 不变）
  const senderWindowId = sender.tab?.windowId;
  const session = senderWindowId ? findSessionByWindowId(senderWindowId) : null;

  if (sender.tab) {
    console.log('[Service Worker] 收到消息:', message.type,
      'tabId:', sender.tab.id, 'windowId:', senderWindowId,
      'session:', session?.id || 'none');
  } else {
    console.log('[Service Worker] 收到消息:', message.type, '(popup)');
  }

  switch (message.type) {
    case 'GET_STATE':
      sendResponse({ state: getPublicState() });
      break;

    case 'START_BATCH_REGISTRATION':
      startBatchRegistration(
        message.loopCount || 1,
        message.concurrency || 1,
        message.provider || 'gmail',
        message.gmailAddress
      ).then(sendResponse);
      return true;

    case 'SET_MAIL_PROVIDER':
      currentMailProvider = message.provider || 'gmail';
      chrome.storage.local.set({ mailProvider: currentMailProvider });
      console.log('[Service Worker] 切换邮箱渠道:', currentMailProvider);
      sendResponse({ success: true });
      break;

    case 'SET_GPTMAIL_APIKEY':
      gptmailApiKey = message.apiKey || 'gpt-test';
      chrome.storage.local.set({ gptmailApiKey: gptmailApiKey });
      console.log('[Service Worker] 设置 GPTMail API Key');
      sendResponse({ success: true });
      break;

    case 'SET_DUCKMAIL_CONFIG':
      if (message.apiKey !== undefined) {
        duckMailApiKey = message.apiKey || '';
        chrome.storage.local.set({ duckMailApiKey });
        console.log('[Service Worker] 设置 DuckMail API Key');
      }
      if (message.domain !== undefined) {
        duckMailDomain = message.domain || '';
        chrome.storage.local.set({ duckMailDomain });
        console.log('[Service Worker] 设置 DuckMail 域名:', duckMailDomain);
      }
      sendResponse({ success: true });
      break;

    case 'GET_DUCKMAIL_DOMAINS':
      (async () => {
        try {
          const tempProvider = new DuckMailProvider({ apiKey: duckMailApiKey });
          const domains = await tempProvider.fetchDomains();
          sendResponse({ success: true, domains });
        } catch (error) {
          console.error('[Service Worker] 获取 DuckMail 域名失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'SET_DENY_ACCESS':
      denyAccess = !!message.value;
      chrome.storage.local.set({ denyAccess });
      console.log('[Service Worker] 设置授权页行为:', denyAccess ? '拒绝' : '允许');
      sendResponse({ success: true });
      break;

    case 'GET_DENY_ACCESS':
      sendResponse({ denyAccess });
      break;

    case 'SET_PROXY_CONFIG':
      if (message.apiUrl !== undefined) {
        proxyApiUrl = message.apiUrl || '';
        chrome.storage.local.set({ proxyApiUrl });
      }
      if (message.apiKey !== undefined) {
        proxyApiKey = message.apiKey || '';
        chrome.storage.local.set({ proxyApiKey });
      }
      if (message.enabled !== undefined) {
        proxyEnabled = !!message.enabled;
        chrome.storage.local.set({ proxyEnabled });
        if (!proxyEnabled) clearIncognitoProxy();
      }
      if (message.manualRaw !== undefined) {
        proxyManualRaw = message.manualRaw || '';
        proxyManualList = parseProxyList(proxyManualRaw);
        proxyRotateIndex = 0;
        chrome.storage.local.set({ proxyManualRaw });
        console.log('[Service Worker] 解析手动代理列表:', proxyManualList.length, '个');
      }
      if (message.usageLimit !== undefined) {
        proxyUsageLimit = Math.max(1, parseInt(message.usageLimit) || 1);
        proxyUsageCount = 0;
        chrome.storage.local.set({ proxyUsageLimit });
        console.log('[Service Worker] 设置单代理使用次数:', proxyUsageLimit);
      }
      if (message.ipDetectEnabled !== undefined) {
        ipDetectEnabled = message.ipDetectEnabled;
        chrome.storage.local.set({ ipDetectEnabled });
        console.log('[Service Worker] 设置 IP 检测 API:', ipDetectEnabled);
      }
      if (message.pageTimeout !== undefined) {
        pageTimeoutMs = Math.max(30000, parseInt(message.pageTimeout) || 300000);
        chrome.storage.local.set({ pageTimeoutMs });
        console.log('[Service Worker] 设置页面超时:', pageTimeoutMs, 'ms');
      }
      console.log('[Service Worker] 设置代理配置:', { proxyApiUrl, proxyEnabled, manualCount: proxyManualList.length, usageLimit: proxyUsageLimit });
      sendResponse({ success: true, parsedCount: proxyManualList.length });
      break;

    case 'GET_PROXY_CONFIG':
      sendResponse({ proxyApiUrl, proxyApiKey, proxyEnabled, proxyManualRaw, parsedCount: proxyManualList.length, proxyUsageLimit, ipDetectEnabled, ipDetectApis: IP_DETECT_APIS.map(a => ({ id: a.id, label: a.label })), deadProxies: [...proxyDeadSet], pageTimeoutMs });
      break;

    case 'REVIVE_PROXY':
      reviveProxy(message.proxyKey);
      console.log('[Service Worker] 恢复代理:', message.proxyKey);
      sendResponse({ success: true, deadProxies: [...proxyDeadSet] });
      break;

    case 'CLEAR_DEAD_PROXIES':
      clearDeadProxies();
      console.log('[Service Worker] 已清空所有不可用代理');
      sendResponse({ success: true });
      break;

    case 'TEST_PROXY_API':
      (async () => {
        try {
          const url = message.apiUrl || proxyApiUrl;
          if (!url) throw new Error('未配置代理提取 API 地址');
          const headers = {};
          const key = message.apiKey || proxyApiKey;
          if (key) headers['Authorization'] = `Bearer ${key}`;
          const response = await chrome.runtime.sendMessage({
            type: 'OFFSCREEN_FETCH',
            url,
            options: { method: 'GET', headers }
          });
          if (response?.success) {
            sendResponse({ success: true, data: response.data });
          } else {
            sendResponse({ success: false, error: response?.error || '请求失败' });
          }
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'SET_MOEMAIL_CONFIG':
      if (message.apiUrl !== undefined) {
        moemailApiUrl = message.apiUrl || 'https://';
        chrome.storage.local.set({ moemailApiUrl });
        console.log('[Service Worker] 设置 MoeMail API URL:', moemailApiUrl);
      }
      if (message.apiKey !== undefined) {
        moemailApiKey = message.apiKey || '';
        chrome.storage.local.set({ moemailApiKey });
        console.log('[Service Worker] 设置 MoeMail API Key');
      }
      if (message.domain !== undefined) {
        moemailDomain = message.domain || '';
        chrome.storage.local.set({ moemailDomain });
        console.log('[Service Worker] 设置 MoeMail 域名:', moemailDomain);
      }
      if (message.prefix !== undefined) {
        moemailPrefix = message.prefix || '';
        chrome.storage.local.set({ moemailPrefix });
        console.log('[Service Worker] 设置 MoeMail 前缀:', moemailPrefix);
      }
      if (message.randomLength !== undefined) {
        moemailRandomLength = message.randomLength || 5;
        chrome.storage.local.set({ moemailRandomLength });
        console.log('[Service Worker] 设置 MoeMail 随机长度:', moemailRandomLength);
      }
      if (message.duration !== undefined) {
        moemailDuration = message.duration || 0;
        chrome.storage.local.set({ moemailDuration });
        console.log('[Service Worker] 设置 MoeMail 有效期:', moemailDuration);
      }
      sendResponse({ success: true });
      break;

    case 'GET_MOEMAIL_DOMAINS':
      (async () => {
        try {
          // 使用 MoeMailProvider 获取域名列表
          const provider = createProvider('moemail', {
            apiUrl: moemailApiUrl,
            apiKey: moemailApiKey
          });

          const domains = await provider.fetchDomains();
          sendResponse({ success: true, domains });
        } catch (error) {
          console.error('[Service Worker] 获取 MoeMail 域名失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'TEST_MOEMAIL_CONNECTION':
      (async () => {
        try {
          // 使用 MoeMailProvider 测试连接
          const provider = createProvider('moemail', {
            apiUrl: message.apiUrl || moemailApiUrl,
            apiKey: message.apiKey || moemailApiKey
          });

          // 尝试获取配置来测试连接
          await provider.fetchDomains();
          sendResponse({ success: true });
        } catch (error) {
          console.error('[Service Worker] 测试 MoeMail 连接失败:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'STOP_REGISTRATION':
      stopRegistration();
      sendResponse({ success: true });
      break;

    case 'GET_VERIFICATION_CODE':
      if (session) {
        getVerificationCode(session).then(sendResponse);
        return true;
      } else {
        console.warn('[Service Worker] GET_VERIFICATION_CODE: 找不到会话, windowId:', senderWindowId);
        sendResponse({ success: false, error: '找不到对应会话' });
      }
      break;

    case 'GET_ACCOUNT_INFO':
      if (session) {
        console.log(`[Service Worker] GET_ACCOUNT_INFO: 会话 ${session.id}, email: ${session.email}`);
        sendResponse({
          email: session.email,
          password: session.password,
          firstName: session.firstName,
          lastName: session.lastName,
          fullName: session.firstName && session.lastName
            ? `${session.firstName} ${session.lastName}`
            : null
        });
      } else {
        // 列出现有会话帮助调试
        const existingSessions = Array.from(sessions.values()).map(s =>
          `${s.id}(windowId:${s.windowId})`
        ).join(', ');
        console.warn('[Service Worker] GET_ACCOUNT_INFO: 找不到会话',
          'senderWindowId:', senderWindowId,
          '现有会话:', existingSessions || '无');
        sendResponse({});
      }
      break;

    case 'RESET':
      resetState().then(() => sendResponse({ success: true }));
      return true;

    case 'UPDATE_STEP':
      if (session) {
        updateSession(session.id, { step: message.step });
      }
      sendResponse({ success: true });
      break;

    case 'REPORT_ERROR':
      if (session) {
        session.status = 'error';
        session.error = message.error;
        updateSession(session.id, { step: '错误: ' + message.error });
      }
      sendResponse({ success: true });
      break;

    case 'PAGE_BLOCKED':
      if (session) {
        session.pageBlocked = true;
        console.warn(`[Session ${session.id}] 页面被阻止 (403/Forbidden)`);
      }
      sendResponse({ success: true });
      break;

    case 'AUTH_COMPLETED':
      if (session) {
        updateSession(session.id, { step: '授权完成，等待 Token...' });
      }
      sendResponse({ success: true });
      break;

    case 'CLEAR_HISTORY':
      registrationHistory = [];
      chrome.storage.local.remove('registrationHistory');
      sendResponse({ success: true });
      break;

    case 'DELETE_HISTORY_ITEM':
      registrationHistory = registrationHistory.filter(r => r.id !== message.id);
      chrome.storage.local.set({ registrationHistory });
      sendResponse({ success: true });
      break;

    case 'EXPORT_HISTORY':
      sendResponse({ history: registrationHistory });
      break;

    case 'VALIDATE_TOKEN':
      // 验证单个 Token
      if (message.accessToken) {
        validateToken(message.accessToken).then(sendResponse);
        return true;
      } else {
        sendResponse({ valid: false, error: '缺少 accessToken' });
      }
      break;

    case 'VALIDATE_ALL_TOKENS':
      // 批量验证所有 Token
      validateAllTokens().then(sendResponse);
      return true;

    case 'GET_VALID_HISTORY':
      // 获取已验证且有效的历史记录（排除 suspended, expired, invalid, error）
      sendResponse({
        history: registrationHistory.filter(r =>
          r.success &&
          r.token &&
          r.tokenStatus !== 'suspended' &&
          r.tokenStatus !== 'expired' &&
          r.tokenStatus !== 'invalid' &&
          r.tokenStatus !== 'error'
        )
      });
      break;

    // ==================== Gmail API 相关消息 ====================

    case 'GMAIL_API_AUTHORIZE':
      // Gmail API 授权
      (async () => {
        try {
          if (!gmailApiClient) {
            gmailApiClient = new GmailApiClient();
          }
          await gmailApiClient.authenticate(true);
          gmailApiAuthorized = true;
          await chrome.storage.local.set({ gmailApiAuthorized: true });
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'GMAIL_API_CHECK_AUTH':
      // 检查 Gmail API 授权状态
      (async () => {
        try {
          if (!gmailApiClient) {
            gmailApiClient = new GmailApiClient();
          }
          const authorized = await gmailApiClient.isAuthorized();
          gmailApiAuthorized = authorized;
          sendResponse({ authorized });
        } catch (error) {
          sendResponse({ authorized: false, error: error.message });
        }
      })();
      return true;

    case 'GMAIL_API_REVOKE':
      // 撤销 Gmail API 授权
      (async () => {
        try {
          if (gmailApiClient) {
            await gmailApiClient.revokeToken();
          }
          gmailApiAuthorized = false;
          await chrome.storage.local.set({ gmailApiAuthorized: false });
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'GMAIL_API_SET_SENDER':
      // 设置验证码发件人
      if (message.sender) {
        gmailSenderFilter = message.sender;
        chrome.storage.local.set({ gmailSenderFilter: message.sender });
      }
      sendResponse({ success: true });
      break;

    case 'GMAIL_API_GET_CONFIG':
      // 获取 Gmail API 配置
      sendResponse({
        authorized: gmailApiAuthorized,
        sender: gmailSenderFilter
      });
      break;

    default:
      sendResponse({ error: '未知消息类型' });
  }
});

// 监听标签页更新（处理窗口内导航时 tabId 更新）
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.incognito && changeInfo.status === 'loading') {
    const session = findSessionByWindowId(tab.windowId);
    if (session && session.tabId !== tabId) {
      console.log(`[Service Worker] 会话 ${session.id} 标签页更新: ${session.tabId} -> ${tabId}`);
      session.tabId = tabId;
    }
  }
});

// 监听窗口关闭
chrome.windows.onRemoved.addListener((windowId) => {
  const session = findSessionByWindowId(windowId);
  if (session) {
    console.log(`[Service Worker] 会话 ${session.id} 的窗口已关闭`);
    if (session.proxy) clearIncognitoProxy();
    session.windowId = null;
    session.tabId = null;
  }
});

// Service Worker 激活时恢复状态
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Service Worker] 扩展已安装/更新');
});

// 恢复历史记录、Gmail API 配置和邮箱渠道
chrome.storage.local.get(['registrationHistory', 'gmailApiAuthorized', 'gmailSenderFilter', 'mailProvider', 'gptmailApiKey', 'duckMailApiKey', 'duckMailDomain', 'moemailApiUrl', 'moemailApiKey', 'moemailDomain', 'moemailPrefix', 'moemailRandomLength', 'moemailDuration', 'denyAccess', 'proxyApiUrl', 'proxyApiKey', 'proxyEnabled', 'proxyManualRaw', 'proxyUsageLimit', 'proxyDeadList', 'ipDetectEnabled', 'pageTimeoutMs']).then((stored) => {
  if (stored.registrationHistory) {
    registrationHistory = stored.registrationHistory;
    console.log('[Service Worker] 恢复历史记录:', registrationHistory.length, '条');
  }

  // 恢复邮箱渠道配置
  if (stored.mailProvider) {
    currentMailProvider = stored.mailProvider;
    console.log('[Service Worker] 恢复邮箱渠道:', currentMailProvider);
  }

  // 恢复 GPTMail API Key
  if (stored.gptmailApiKey) {
    gptmailApiKey = stored.gptmailApiKey;
    console.log('[Service Worker] 恢复 GPTMail API Key');
  }

  // 恢复 DuckMail 配置
  if (stored.duckMailApiKey) {
    duckMailApiKey = stored.duckMailApiKey;
    console.log('[Service Worker] 恢复 DuckMail API Key');
  }
  if (stored.duckMailDomain) {
    duckMailDomain = stored.duckMailDomain;
    console.log('[Service Worker] 恢复 DuckMail 域名:', duckMailDomain);
  }

  // 恢复 MoeMail 配置
  if (stored.moemailApiUrl) {
    moemailApiUrl = stored.moemailApiUrl;
    console.log('[Service Worker] 恢复 MoeMail API URL:', moemailApiUrl);
  }
  if (stored.moemailApiKey) {
    moemailApiKey = stored.moemailApiKey;
    console.log('[Service Worker] 恢复 MoeMail API Key');
  }
  if (stored.moemailDomain) {
    moemailDomain = stored.moemailDomain;
    console.log('[Service Worker] 恢复 MoeMail 域名:', moemailDomain);
  }
  if (stored.moemailPrefix !== undefined) {
    moemailPrefix = stored.moemailPrefix;
    console.log('[Service Worker] 恢复 MoeMail 前缀:', moemailPrefix);
  }
  if (stored.moemailRandomLength) {
    moemailRandomLength = stored.moemailRandomLength;
    console.log('[Service Worker] 恢复 MoeMail 随机长度:', moemailRandomLength);
  }
  if (stored.moemailDuration !== undefined) {
    moemailDuration = stored.moemailDuration;
    console.log('[Service Worker] 恢复 MoeMail 有效期:', moemailDuration);
  }

  // 恢复授权页行为配置
  if (stored.denyAccess !== undefined) {
    denyAccess = stored.denyAccess;
    console.log('[Service Worker] 恢复授权页行为:', denyAccess ? '拒绝' : '允许');
  }

  // 恢复代理配置
  if (stored.proxyApiUrl) {
    proxyApiUrl = stored.proxyApiUrl;
    console.log('[Service Worker] 恢复代理 API URL:', proxyApiUrl);
  }
  if (stored.proxyApiKey) {
    proxyApiKey = stored.proxyApiKey;
  }
  if (stored.proxyEnabled !== undefined) {
    proxyEnabled = stored.proxyEnabled;
    console.log('[Service Worker] 恢复代理启用状态:', proxyEnabled);
  }
  if (stored.proxyManualRaw) {
    proxyManualRaw = stored.proxyManualRaw;
    proxyManualList = parseProxyList(proxyManualRaw);
    console.log('[Service Worker] 恢复手动代理列表:', proxyManualList.length, '个');
  }
  if (stored.proxyUsageLimit !== undefined) {
    proxyUsageLimit = Math.max(1, parseInt(stored.proxyUsageLimit) || 1);
    console.log('[Service Worker] 恢复单代理使用次数:', proxyUsageLimit);
  }
  if (stored.proxyDeadList && Array.isArray(stored.proxyDeadList)) {
    proxyDeadSet = new Set(stored.proxyDeadList);
    if (proxyDeadSet.size > 0) {
      console.log('[Service Worker] 恢复不可用代理:', proxyDeadSet.size, '个');
    }
  }
  if (stored.ipDetectEnabled && Array.isArray(stored.ipDetectEnabled)) {
    ipDetectEnabled = stored.ipDetectEnabled;
    console.log('[Service Worker] 恢复 IP 检测 API:', ipDetectEnabled);
  }
  if (stored.pageTimeoutMs !== undefined) {
    pageTimeoutMs = Math.max(30000, parseInt(stored.pageTimeoutMs) || 300000);
    console.log('[Service Worker] 恢复页面超时:', pageTimeoutMs, 'ms');
  }

  // 恢复 Gmail API 配置
  if (stored.gmailSenderFilter) {
    gmailSenderFilter = stored.gmailSenderFilter;
  }

  // 检查 Gmail API 授权状态
  if (stored.gmailApiAuthorized) {
    gmailApiClient = new GmailApiClient();
    gmailApiClient.isAuthorized().then(authorized => {
      gmailApiAuthorized = authorized;
      console.log('[Service Worker] Gmail API 授权状态:', authorized ? '已授权' : '未授权');
    }).catch(() => {
      gmailApiAuthorized = false;
    });
  }
});
