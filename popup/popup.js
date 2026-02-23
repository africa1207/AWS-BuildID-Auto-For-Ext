/**
 * Popup 脚本 - 弹窗逻辑
 * 支持自定义循环次数和多窗口并发
 */

// DOM 元素
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const stepText = document.getElementById('step-text');
const counter = document.getElementById('counter');

const loopCountInput = document.getElementById('loop-count');
const concurrencyInput = document.getElementById('concurrency');

const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const resetBtn = document.getElementById('reset-btn');

const errorSection = document.getElementById('error-section');
const errorText = document.getElementById('error-text');

const sessionsSection = document.getElementById('sessions-section');
const sessionsList = document.getElementById('sessions-list');

const accountSection = document.getElementById('account-section');
const emailValue = document.getElementById('email-value');
const passwordValue = document.getElementById('password-value');

const tokenSection = document.getElementById('token-section');
const accessTokenValue = document.getElementById('access-token-value');

const historyList = document.getElementById('history-list');
const exportBtn = document.getElementById('export-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');
const clearBtn = document.getElementById('clear-btn');
const validateBtn = document.getElementById('validate-btn');
const validateSection = document.getElementById('validate-section');
const validateText = document.getElementById('validate-text');

// Gmail 配置元素
const gmailAddressInput = document.getElementById('gmail-address');
const gmailSaveBtn = document.getElementById('gmail-save-btn');
const gmailStatus = document.getElementById('gmail-status');
const gmailAuthBtn = document.getElementById('gmail-auth-btn');
const gmailAuthStatus = document.getElementById('gmail-auth-status');
const gmailSenderInput = document.getElementById('gmail-sender');
const gmailSenderSaveBtn = document.getElementById('gmail-sender-save-btn');

// 渠道选择元素
const mailProviderSelect = document.getElementById('mail-provider-select');
const gmailConfigPanel = document.getElementById('gmail-config-panel');
const guerrillaConfigPanel = document.getElementById('guerrilla-config-panel');
const gptmailConfigPanel = document.getElementById('gptmail-config-panel');

// GPTMail 配置元素
const gptmailApiKeyInput = document.getElementById('gptmail-apikey');
const gptmailSaveBtn = document.getElementById('gptmail-save-btn');

// DuckMail 配置元素
const duckMailConfigPanel = document.getElementById('duckmail-config-panel');
const duckMailApiKeyInput = document.getElementById('duckmail-apikey');
const duckMailApiKeySaveBtn = document.getElementById('duckmail-apikey-save-btn');
const duckMailDomainSelect = document.getElementById('duckmail-domain-select');
const duckMailRefreshDomainsBtn = document.getElementById('duckmail-refresh-domains-btn');

// MoeMail 配置元素
const moemailConfigPanel = document.getElementById('moemail-config-panel');
const moemailApiUrlInput = document.getElementById('moemail-api-url');
const moemailApiKeyInput = document.getElementById('moemail-api-key');
const moemailSaveApiBtn = document.getElementById('moemail-save-api-btn');
const moemailTestConnectionBtn = document.getElementById('moemail-test-connection-btn');
const moemailDurationSelect = document.getElementById('moemail-duration-select');
const moemailDomainSelect = document.getElementById('moemail-domain-select');
const moemailRefreshDomainsBtn = document.getElementById('moemail-refresh-domains-btn');
const moemailPrefixInput = document.getElementById('moemail-prefix');
const moemailRandomLengthInput = document.getElementById('moemail-random-length');
const moemailPreviewText = document.getElementById('moemail-preview-text');
const moemailStatus = document.getElementById('moemail-status');

// Token Pool 元素
const poolApiKeyInput = document.getElementById('pool-api-key');
const poolConnectBtn = document.getElementById('pool-connect-btn');
const poolDisconnectBtn = document.getElementById('pool-disconnect-btn');
const poolUploadBtn = document.getElementById('pool-upload-btn');
const poolConfig = document.getElementById('pool-config');
const poolUserInfo = document.getElementById('pool-user-info');
const poolUsername = document.getElementById('pool-username');
const poolPoints = document.getElementById('pool-points');

// Gmail 配置
let gmailAddress = '';

// 当前选择的邮箱渠道
let currentProvider = 'gmail';

// Token Pool 配置
const POOL_API_URL = 'http://localhost:8080';
let poolApiKey = '';
let poolUser = null;

/**
 * 更新 UI 状态
 */
function updateUI(state) {
  console.log('[Popup] 更新 UI:', state);

  // 状态指示器
  statusDot.className = 'dot';
  switch (state.status) {
    case 'idle':
      statusDot.classList.add('idle');
      statusText.textContent = '准备就绪';
      break;
    case 'running':
      statusDot.classList.add('processing');
      statusText.textContent = '注册进行中';
      break;
    case 'completed':
      statusDot.classList.add('success');
      statusText.textContent = '全部完成';
      break;
    case 'error':
      statusDot.classList.add('error');
      statusText.textContent = '发生错误';
      break;
    default:
      statusDot.classList.add('idle');
      statusText.textContent = state.status || '未知状态';
  }

  // 计数器
  if (state.totalTarget > 0) {
    counter.style.display = 'inline';
    counter.textContent = `${state.totalRegistered}/${state.totalTarget}`;
  } else {
    counter.style.display = 'none';
  }

  // 步骤文本
  stepText.textContent = state.step || '';

  // 错误显示
  if (state.error) {
    errorSection.style.display = 'flex';
    errorText.textContent = state.error;
  } else {
    errorSection.style.display = 'none';
  }

  // 按钮和设置状态
  const isRunning = state.status === 'running';
  const isIdle = state.status === 'idle';
  const isFinished = state.status === 'completed' || state.status === 'error';

  // 设置输入框禁用状态
  loopCountInput.disabled = !isIdle;
  concurrencyInput.disabled = !isIdle;

  if (isIdle) {
    startBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
    resetBtn.style.display = 'none';
  } else if (isRunning) {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
    resetBtn.style.display = 'none';
  } else if (isFinished) {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    resetBtn.style.display = 'flex';
    resetBtn.style.flex = '1';
  }

  // 并发会话显示
  if (state.sessions && state.sessions.length > 0) {
    sessionsSection.style.display = 'block';
    renderSessions(state.sessions);
  } else {
    sessionsSection.style.display = 'none';
  }

  // 账号信息（显示最后一个成功的）
  if (state.lastSuccess) {
    accountSection.style.display = 'block';
    emailValue.textContent = state.lastSuccess.email || '-';
    passwordValue.textContent = state.lastSuccess.password || '-';
  } else {
    accountSection.style.display = 'none';
  }

  // Token 信息
  if (state.lastSuccess?.token) {
    tokenSection.style.display = 'block';
    accessTokenValue.textContent = state.lastSuccess.token.accessToken || '-';
  } else {
    tokenSection.style.display = 'none';
  }

  // 历史记录
  renderHistory(state.history || []);
}

/**
 * 渲染并发会话列表
 */
function renderSessions(sessions) {
  sessionsList.innerHTML = sessions.map((session, index) => {
    let statusClass = 'running';
    if (session.status === 'completed') statusClass = 'success';
    else if (session.status === 'error') statusClass = 'error';

    return `
      <div class="session-item">
        <span class="session-id">#${index + 1}</span>
        <span class="session-status ${statusClass}"></span>
        <span class="session-step">${session.step || session.status}</span>
        <span class="session-email">${session.email || ''}</span>
      </div>
    `;
  }).join('');
}

/**
 * 渲染历史记录
 */
function renderHistory(history) {
  if (!history || history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">暂无记录</div>';
    return;
  }

  historyList.innerHTML = history.slice(0, 20).map(item => {
    // 确定状态类
    let statusClass = item.success ? 'success' : 'failed';
    if (item.success && item.tokenStatus) {
      const statusClassMap = {
        valid: 'success',
        suspended: 'suspended',
        expired: 'expired',
        invalid: 'invalid',
        error: 'error',
        unknown: 'unknown'
      };
      statusClass = statusClassMap[item.tokenStatus] || 'unknown';
    }

    // Token 状态徽章
    let tokenBadge = '';
    if (item.success && item.tokenStatus) {
      const badgeLabels = {
        valid: '有效',
        suspended: '封禁',
        expired: '过期',
        invalid: '无效',
        error: '错误',
        unknown: '未验证'
      };
      tokenBadge = `<span class="token-badge ${item.tokenStatus}">${badgeLabels[item.tokenStatus] || item.tokenStatus}</span>`;
    }

    return `
    <div class="history-item" data-id="${item.id}">
      <div class="history-status ${statusClass}"></div>
      <div class="history-info">
        <div class="history-email">${item.email || '-'}${tokenBadge}</div>
        <div class="history-time">${item.time || ''}</div>
      </div>
      <div class="history-actions">
        ${item.success && item.token ? `<button class="kiro-btn" data-id="${item.id}" title="同步至 Kiro IDE">Kiro</button>` : ''}
        ${item.success && item.token ? `<button class="copy-json-btn" data-id="${item.id}" title="复制为 JSON">JSON</button>` : ''}
        <button class="copy-btn-record" data-id="${item.id}">复制</button>
        <button class="delete-btn-record" data-id="${item.id}" title="删除此记录">&#x2715;</button>
      </div>
    </div>
  `;
  }).join('');
}

// 事件委托：处理历史记录按钮点击
historyList.addEventListener('click', async (e) => {
  const target = e.target;

  // Kiro 同步按钮
  if (target.classList.contains('kiro-btn')) {
    const id = target.getAttribute('data-id');
    await syncToKiro(id);
  }

  // JSON 复制按钮
  if (target.classList.contains('copy-json-btn')) {
    const id = target.getAttribute('data-id');
    await copyRecordJson(id);
  }

  // 复制按钮
  if (target.classList.contains('copy-btn-record')) {
    const id = target.getAttribute('data-id');
    await copyRecord(id);
  }

  // 删除按钮
  if (target.classList.contains('delete-btn-record')) {
    const id = target.getAttribute('data-id');
    await chrome.runtime.sendMessage({ type: 'DELETE_HISTORY_ITEM', id });
    target.closest('.history-item').remove();
    if (historyList.children.length === 0) {
      historyList.innerHTML = '<div class="history-empty">暂无记录</div>';
    }
  }
});

/**
 * 检测操作系统类型
 * @returns {'windows' | 'macos' | 'linux'}
 */
function detectOS() {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (platform.includes('win') || userAgent.includes('windows')) {
    return 'windows';
  } else if (platform.includes('mac') || userAgent.includes('macintosh')) {
    return 'macos';
  } else {
    return 'linux';
  }
}

/**
 * 同步至 Kiro IDE（生成命令并复制到剪贴板）
 * 智能检测操作系统，生成对应的命令
 */
async function syncToKiro(id) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_HISTORY' });
    const record = response.history?.find(r => String(r.id) === String(id));

    if (!record) {
      alert('找不到该记录');
      return;
    }
    if (!record.token) {
      alert('该记录没有 Token 信息');
      return;
    }

    const { clientId, clientSecret, accessToken, refreshToken } = record.token;
    if (!clientId || !accessToken) {
      alert('Token 信息不完整');
      return;
    }

    // 计算 clientId 的 SHA1 哈希
    const encoder = new TextEncoder();
    const data = encoder.encode(clientId);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const clientIdHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const clientExpiresAt = new Date(Date.now() + 90 * 86400 * 1000).toISOString();

    const authToken = JSON.stringify({
      accessToken,
      refreshToken,
      expiresAt,
      clientIdHash,
      authMethod: 'IdC',
      provider: 'BuilderId',
      region: 'us-east-1'
    }, null, 2);

    const clientInfo = JSON.stringify({
      clientId,
      clientSecret,
      expiresAt: clientExpiresAt
    }, null, 2);

    // 智能检测操作系统
    const os = detectOS();
    let command = '';
    let terminalName = '';

    if (os === 'windows') {
      // Windows PowerShell 命令
      // 使用 .NET 方法写入无 BOM 的 UTF-8 文件，避免编码问题
      const authTokenEscaped = authToken.replace(/`/g, '``').replace(/\$/g, '`$');
      const clientInfoEscaped = clientInfo.replace(/`/g, '``').replace(/\$/g, '`$');
      
      command = `$ssoDir = "$env:USERPROFILE\\.aws\\sso\\cache"
if (!(Test-Path $ssoDir)) { New-Item -ItemType Directory -Force -Path $ssoDir | Out-Null }
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$authToken = @"
${authTokenEscaped}
"@
$clientInfo = @"
${clientInfoEscaped}
"@
[System.IO.File]::WriteAllText("$ssoDir\\kiro-auth-token.json", $authToken, $utf8NoBom)
[System.IO.File]::WriteAllText("$ssoDir\\${clientIdHash}.json", $clientInfo, $utf8NoBom)
Write-Host "已同步至 Kiro IDE (UTF-8 无 BOM)" -ForegroundColor Green`;
      terminalName = 'PowerShell';
    } else {
      // macOS / Linux bash 命令
      command = `mkdir -p ~/.aws/sso/cache && cat > ~/.aws/sso/cache/kiro-auth-token.json << 'EOF'
${authToken}
EOF
cat > ~/.aws/sso/cache/${clientIdHash}.json << 'EOF'
${clientInfo}
EOF
echo "已同步至 Kiro IDE"`;
      terminalName = '终端';
    }

    await navigator.clipboard.writeText(command);
    alert(`检测到 ${os === 'windows' ? 'Windows' : os === 'macos' ? 'macOS' : 'Linux'} 系统\n命令已复制到剪贴板\n\n请在 ${terminalName} 中粘贴执行`);
  } catch (err) {
    alert('同步失败: ' + err.message);
  }
}

/**
 * 复制记录为 JSON
 */
async function copyRecordJson(id) {
  const response = await chrome.runtime.sendMessage({ type: 'EXPORT_HISTORY' });
  const record = response.history?.find(r => String(r.id) === String(id));
  if (record?.token) {
    const json = JSON.stringify({
      clientId: record.token.clientId || '',
      clientSecret: record.token.clientSecret || '',
      accessToken: record.token.accessToken || '',
      refreshToken: record.token.refreshToken || ''
    }, null, 2);
    await navigator.clipboard.writeText(json);
    alert('JSON 已复制到剪贴板');
  }
}

/**
 * 复制记录
 */
async function copyRecord(id) {
  const response = await chrome.runtime.sendMessage({ type: 'EXPORT_HISTORY' });
  const record = response.history?.find(r => String(r.id) === String(id));
  if (record) {
    const text = `邮箱: ${record.email}\n密码: ${record.password}\n姓名: ${record.firstName} ${record.lastName}\nToken: ${record.token?.accessToken || '无'}`;
    await navigator.clipboard.writeText(text);
    alert('已复制到剪贴板');
  }
}

/**
 * 复制到剪贴板
 */
async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    button.classList.add('copied');
    const originalText = button.textContent;
    button.textContent = '已复制';
    setTimeout(() => {
      button.classList.remove('copied');
      button.textContent = originalText;
    }, 1500);
  } catch (err) {
    console.error('复制失败:', err);
  }
}

/**
 * 开始注册
 */
async function startRegistration() {
  const loopCount = parseInt(loopCountInput.value) || 1;
  const concurrency = parseInt(concurrencyInput.value) || 1;

  // 根据渠道类型检查配置
  if (currentProvider === 'gmail') {
    if (!gmailAddress) {
      alert('请先配置 Gmail 地址');
      gmailAddressInput.focus();
      return;
    }
  } else if (currentProvider === 'duckmail') {
    if (!duckMailDomainSelect.value) {
      alert('请先选择 DuckMail 域名');
      return;
    }
  }

  // 验证输入
  if (loopCount < 1 || loopCount > 100) {
    alert('注册数量需在 1-100 之间');
    return;
  }
  if (concurrency < 1 || concurrency > 3) {
    alert('并发窗口需在 1-3 之间');
    return;
  }

  // Gmail 别名模式建议并发为 1
  if (currentProvider === 'gmail' && concurrency > 1) {
    const confirm = window.confirm('使用 Gmail 别名模式时，建议并发设为 1（需要手动输入验证码）。\n\n是否继续？');
    if (!confirm) return;
  }

  startBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'START_BATCH_REGISTRATION',
      loopCount,
      concurrency,
      provider: currentProvider,
      gmailAddress: currentProvider === 'gmail' ? gmailAddress : ''
    });
    console.log('[Popup] 注册响应:', response);

    if (response.state) {
      updateUI(response.state);
    }
  } catch (error) {
    console.error('[Popup] 注册错误:', error);
    updateUI({
      status: 'error',
      error: error.message
    });
  } finally {
    startBtn.disabled = false;
  }
}

/**
 * 停止注册
 */
async function stopRegistration() {
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_REGISTRATION' });
  } catch (error) {
    console.error('[Popup] 停止错误:', error);
  }
}

/**
 * 重置
 */
async function reset() {
  try {
    await chrome.runtime.sendMessage({ type: 'RESET' });
    // 重新获取状态
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (response?.state) {
      updateUI(response.state);
    } else {
      updateUI({ status: 'idle', history: [] });
    }
  } catch (error) {
    console.error('[Popup] 重置错误:', error);
  }
}

/**
 * 导出历史 (JSON) - 只导出有效的 Token
 */
async function exportHistory() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_HISTORY' });
    const history = response.history || [];

    if (history.length === 0) {
      alert('暂无记录');
      return;
    }

    // 只导出成功且 token 状态是 valid 或 unknown（未验证）的记录
    // 过滤掉: suspended, expired, invalid, error
    const validRecords = history.filter(r =>
      r.success &&
      r.token &&
      r.tokenStatus !== 'suspended' &&
      r.tokenStatus !== 'expired' &&
      r.tokenStatus !== 'invalid' &&
      r.tokenStatus !== 'error'
    );

    if (validRecords.length === 0) {
      alert('没有有效的注册记录（可能全部被封禁、过期或无效）');
      return;
    }

    // 生成 JSON 格式（与原项目一致，只包含 Token 信息）
    const jsonData = validRecords.map(r => ({
      clientId: r.token?.clientId || '',
      clientSecret: r.token?.clientSecret || '',
      accessToken: r.token?.accessToken || '',
      refreshToken: r.token?.refreshToken || ''
    }));

    const jsonStr = JSON.stringify(jsonData, null, 2);

    // 下载 JSON
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // 提示导出数量
    const totalSuccess = history.filter(r => r.success && r.token).length;
    if (validRecords.length < totalSuccess) {
      alert(`已导出 ${validRecords.length} 个有效账号（共 ${totalSuccess} 个成功注册，${totalSuccess - validRecords.length} 个被过滤）`);
    }

  } catch (error) {
    console.error('[Popup] 导出错误:', error);
  }
}

/**
 * 导出为 CSV（完整信息，包含 Token 状态）
 */
async function exportHistoryCSV() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_HISTORY' });
    const history = response.history || [];

    if (history.length === 0) {
      alert('暂无记录');
      return;
    }

    // CSV 格式（添加 token_status 字段）
    const headers = ['email', 'password', 'first_name', 'last_name', 'client_id', 'client_secret', 'access_token', 'refresh_token', 'success', 'token_status', 'error'];
    const rows = history.map(r => [
      r.email || '',
      r.password || '',
      r.firstName || '',
      r.lastName || '',
      r.token?.clientId || '',
      r.token?.clientSecret || '',
      r.token?.accessToken || '',
      r.token?.refreshToken || '',
      r.success ? 'true' : 'false',
      r.tokenStatus || '',
      r.error || ''
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');

    // 下载 CSV
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('[Popup] 导出 CSV 错误:', error);
  }
}

/**
 * 清空历史
 */
async function clearHistory() {
  if (!confirm('确定要清空所有历史记录吗？')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
    renderHistory([]);
  } catch (error) {
    console.error('[Popup] 清空错误:', error);
  }
}

/**
 * 验证所有 Token
 */
async function validateAllTokens() {
  validateBtn.disabled = true;
  validateSection.style.display = 'block';
  validateSection.classList.remove('validate-result');
  validateText.textContent = '正在验证所有 Token (0/0)...';

  try {
    // 监听验证进度
    const progressListener = (message) => {
      if (message.type === 'VALIDATION_PROGRESS') {
        const { validated, total } = message.progress;
        validateText.textContent = `正在验证 Token (${validated}/${total})...`;
      }
    };
    chrome.runtime.onMessage.addListener(progressListener);

    const response = await chrome.runtime.sendMessage({ type: 'VALIDATE_ALL_TOKENS' });
    console.log('[Popup] 验证结果:', response);

    // 移除进度监听器
    chrome.runtime.onMessage.removeListener(progressListener);

    validateSection.classList.add('validate-result');

    // 构建结果文本
    const parts = [];
    if (response.valid > 0) parts.push(`${response.valid} 有效`);
    if (response.expired > 0) parts.push(`${response.expired} 过期`);
    if (response.suspended > 0) parts.push(`${response.suspended} 封禁`);
    if (response.invalid > 0) parts.push(`${response.invalid} 无效`);
    if (response.error > 0) parts.push(`${response.error} 错误`);

    validateText.textContent = `验证完成: ${parts.join(', ')}`;

    // 5秒后隐藏
    setTimeout(() => {
      validateSection.style.display = 'none';
    }, 5000);

    // 刷新状态
    const stateResponse = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (stateResponse?.state) {
      updateUI(stateResponse.state);
    }

  } catch (error) {
    console.error('[Popup] 验证错误:', error);
    validateSection.classList.add('validate-result');
    validateText.textContent = '验证失败: ' + error.message;
  } finally {
    validateBtn.disabled = false;
  }
}

// ==================== Gmail 配置功能 ====================

/**
 * 切换渠道配置面板显示
 */
function switchProviderPanel(providerId) {
  // 隐藏所有面板
  gmailConfigPanel.style.display = 'none';
  guerrillaConfigPanel.style.display = 'none';
  gptmailConfigPanel.style.display = 'none';
  duckMailConfigPanel.style.display = 'none';
  moemailConfigPanel.style.display = 'none';

  // 显示对应面板
  switch (providerId) {
    case 'gmail':
      gmailConfigPanel.style.display = 'flex';
      break;
    case 'guerrilla':
      guerrillaConfigPanel.style.display = 'block';
      break;
    case 'gptmail':
      gptmailConfigPanel.style.display = 'block';
      break;
    case 'duckmail':
      duckMailConfigPanel.style.display = 'block';
      loadDuckMailDomains();  // 切换到 DuckMail 时加载域名
      break;
    case 'moemail':
      moemailConfigPanel.style.display = 'block';
      loadMoeMailConfig();  // 切换到 MoeMail 时加载配置
      break;
  }
}

/**
 * 加载邮箱渠道配置
 */
async function loadProviderConfig() {
  try {
    const result = await chrome.storage.local.get(['mailProvider']);
    if (result.mailProvider) {
      currentProvider = result.mailProvider;
      mailProviderSelect.value = currentProvider;
    }
    switchProviderPanel(currentProvider);
  } catch (error) {
    console.error('[Provider] 加载配置错误:', error);
  }
}

/**
 * 保存邮箱渠道配置
 */
async function saveProviderConfig(providerId) {
  try {
    currentProvider = providerId;
    await chrome.storage.local.set({ mailProvider: providerId });
    // 通知 service worker 切换渠道
    await chrome.runtime.sendMessage({
      type: 'SET_MAIL_PROVIDER',
      provider: providerId
    });
    console.log('[Provider] 已切换到:', providerId);
  } catch (error) {
    console.error('[Provider] 保存配置错误:', error);
  }
}

/**
 * 加载 Gmail 配置
 */
async function loadGmailConfig() {
  try {
    const result = await chrome.storage.local.get(['gmailAddress']);
    if (result.gmailAddress) {
      gmailAddress = result.gmailAddress;
      gmailAddressInput.value = gmailAddress;
      updateGmailStatus(true);
    }
  } catch (error) {
    console.error('[Gmail] 加载配置错误:', error);
  }
}

/**
 * 保存 Gmail 配置
 */
async function saveGmailConfig() {
  const email = gmailAddressInput.value.trim();
  
  if (!email) {
    gmailStatus.textContent = '请输入邮箱地址';
    gmailStatus.classList.add('error');
    return;
  }
  
  // 验证邮箱格式
  if (!email.includes('@')) {
    gmailStatus.textContent = '邮箱格式无效';
    gmailStatus.classList.add('error');
    return;
  }
  
  try {
    gmailAddress = email;
    await chrome.storage.local.set({ gmailAddress: email });
    updateGmailStatus(true);
  } catch (error) {
    console.error('[Gmail] 保存配置错误:', error);
    gmailStatus.textContent = '保存失败: ' + error.message;
    gmailStatus.classList.add('error');
  }
}

/**
 * 更新 Gmail 状态显示
 */
function updateGmailStatus(saved) {
  if (saved && gmailAddress) {
    gmailStatus.textContent = `✓ 已配置: ${gmailAddress}`;
    gmailStatus.classList.remove('error');
  } else {
    gmailStatus.textContent = '';
    gmailStatus.classList.remove('error');
  }
}

// ==================== Gmail API 授权功能 ====================

/**
 * 加载 Gmail API 配置
 */
async function loadGmailApiConfig() {
  try {
    // 从 service worker 获取配置
    const response = await chrome.runtime.sendMessage({ type: 'GMAIL_API_GET_CONFIG' });

    // 更新授权状态显示
    updateGmailAuthStatus(response.authorized);

    // 更新发件人配置
    if (response.sender) {
      gmailSenderInput.value = response.sender;
    }
  } catch (error) {
    console.error('[Gmail API] 加载配置错误:', error);
  }
}

/**
 * 更新 Gmail API 授权状态显示
 */
function updateGmailAuthStatus(authorized) {
  if (authorized) {
    gmailAuthStatus.textContent = '✓ 已授权';
    gmailAuthStatus.classList.remove('error');
    gmailAuthStatus.classList.add('success');
    gmailAuthBtn.textContent = '重新授权';
  } else {
    gmailAuthStatus.textContent = '';
    gmailAuthStatus.classList.remove('success', 'error');
    gmailAuthBtn.textContent = '授权 Gmail API';
  }
}

/**
 * Gmail API 授权
 */
async function authorizeGmailApi() {
  gmailAuthBtn.disabled = true;
  gmailAuthBtn.textContent = '授权中...';
  gmailAuthStatus.textContent = '';
  gmailAuthStatus.classList.remove('success', 'error');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GMAIL_API_AUTHORIZE' });

    if (response.success) {
      updateGmailAuthStatus(true);
    } else {
      gmailAuthStatus.textContent = '授权失败: ' + response.error;
      gmailAuthStatus.classList.add('error');
      gmailAuthBtn.textContent = '授权 Gmail API';
    }
  } catch (error) {
    gmailAuthStatus.textContent = '授权失败: ' + error.message;
    gmailAuthStatus.classList.add('error');
    gmailAuthBtn.textContent = '授权 Gmail API';
  } finally {
    gmailAuthBtn.disabled = false;
  }
}

/**
 * 保存验证码发件人配置
 */
async function saveGmailSender() {
  const sender = gmailSenderInput.value.trim();
  if (!sender) {
    alert('请输入发件人地址');
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      type: 'GMAIL_API_SET_SENDER',
      sender: sender
    });

    // 显示保存成功提示
    gmailSenderSaveBtn.textContent = '已保存';
    setTimeout(() => {
      gmailSenderSaveBtn.textContent = '保存';
    }, 1500);
  } catch (error) {
    alert('保存失败: ' + error.message);
  }
}

// ==================== Token Pool 功能 ====================

// ==================== GPTMail 配置功能 ====================

/**
 * 加载 GPTMail 配置
 */
async function loadGptmailConfig() {
  try {
    const result = await chrome.storage.local.get(['gptmailApiKey']);
    if (result.gptmailApiKey) {
      gptmailApiKeyInput.value = result.gptmailApiKey;
    }
  } catch (error) {
    console.error('[GPTMail] 加载配置错误:', error);
  }
}

/**
 * 保存 GPTMail 配置
 */
async function saveGptmailConfig() {
  const apiKey = gptmailApiKeyInput.value.trim() || 'gpt-test';

  try {
    await chrome.storage.local.set({ gptmailApiKey: apiKey });
    // 通知 service worker
    await chrome.runtime.sendMessage({
      type: 'SET_GPTMAIL_APIKEY',
      apiKey: apiKey
    });

    // 显示保存成功提示
    gptmailSaveBtn.textContent = '已保存';
    setTimeout(() => {
      gptmailSaveBtn.textContent = '保存';
    }, 1500);

    console.log('[GPTMail] API Key 已保存');
  } catch (error) {
    console.error('[GPTMail] 保存配置错误:', error);
    alert('保存失败: ' + error.message);
  }
}

// ==================== Token Pool 功能（原位置） ====================

// ==================== DuckMail 配置功能 ====================

/**
 * 加载 DuckMail 配置
 */
async function loadDuckMailConfig() {
  try {
    const result = await chrome.storage.local.get(['duckMailApiKey', 'duckMailDomain']);
    if (result.duckMailApiKey) {
      duckMailApiKeyInput.value = result.duckMailApiKey;
    }
    if (result.duckMailDomain) {
      // 域名列表加载后会自动选中
      duckMailDomainSelect._savedDomain = result.duckMailDomain;
    }
  } catch (error) {
    console.error('[DuckMail] 加载配置错误:', error);
  }
}

/**
 * 保存 DuckMail API Key
 */
async function saveDuckMailApiKey() {
  const apiKey = duckMailApiKeyInput.value.trim();

  try {
    await chrome.storage.local.set({ duckMailApiKey: apiKey });
    await chrome.runtime.sendMessage({
      type: 'SET_DUCKMAIL_CONFIG',
      apiKey: apiKey
    });

    duckMailApiKeySaveBtn.textContent = '已保存';
    setTimeout(() => { duckMailApiKeySaveBtn.textContent = '保存'; }, 1500);

    console.log('[DuckMail] API Key 已保存');
    // 保存后刷新域名列表（可能有私有域名）
    await loadDuckMailDomains();
  } catch (error) {
    console.error('[DuckMail] 保存 API Key 错误:', error);
    alert('保存失败: ' + error.message);
  }
}

/**
 * 加载 DuckMail 域名列表
 */
async function loadDuckMailDomains() {
  duckMailDomainSelect.innerHTML = '<option value="">加载域名中...</option>';
  duckMailDomainSelect.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_DUCKMAIL_DOMAINS' });

    if (!response.success) {
      throw new Error(response.error || '获取域名失败');
    }

    const domains = response.domains || [];
    const savedDomain = duckMailDomainSelect._savedDomain ||
      (await chrome.storage.local.get(['duckMailDomain'])).duckMailDomain || '';

    duckMailDomainSelect.innerHTML = domains.map(d =>
      `<option value="${d}" ${d === savedDomain ? 'selected' : ''}>${d}</option>`
    ).join('');

    // 如果没有保存的域名，默认选第一个并保存
    if (!savedDomain && domains.length > 0) {
      saveDuckMailDomain(domains[0]);
    } else if (savedDomain) {
      saveDuckMailDomain(savedDomain);
    }

  } catch (error) {
    console.error('[DuckMail] 加载域名失败:', error);
    duckMailDomainSelect.innerHTML = '<option value="">加载失败，点击刷新</option>';
  } finally {
    duckMailDomainSelect.disabled = false;
  }
}

// ==================== MoeMail 配置功能 ====================

/**
 * MoeMail 配置状态
 */
let moemailConfig = {
  apiUrl: 'https://',
  apiKey: '',
  domain: '',
  prefix: '',
  randomLength: 5,
  duration: 0,
  isConnected: false
};

/**
 * 加载 MoeMail 配置
 */
async function loadMoeMailConfig() {
  try {
    const result = await chrome.storage.local.get(['moemailApiUrl', 'moemailApiKey', 'moemailDomain', 'moemailPrefix', 'moemailRandomLength', 'moemailDuration']);
    
    if (result.moemailApiUrl) {
      moemailConfig.apiUrl = result.moemailApiUrl;
      moemailApiUrlInput.value = result.moemailApiUrl;
    }
    if (result.moemailApiKey) {
      moemailConfig.apiKey = result.moemailApiKey;
      moemailApiKeyInput.value = result.moemailApiKey;
    }
    if (result.moemailDomain) {
      moemailConfig.domain = result.moemailDomain;
    }
    if (result.moemailPrefix !== undefined) {
      moemailConfig.prefix = result.moemailPrefix;
      moemailPrefixInput.value = result.moemailPrefix;
    }
    if (result.moemailRandomLength) {
      moemailConfig.randomLength = result.moemailRandomLength;
      moemailRandomLengthInput.value = result.moemailRandomLength;
    }
    if (result.moemailDuration !== undefined) {
      moemailConfig.duration = result.moemailDuration;
      moemailDurationSelect.value = result.moemailDuration;
    }

    // 如果有 API Key，自动测试连接
    if (moemailConfig.apiKey) {
      await testMoeMailConnection();
    }
  } catch (error) {
    console.error('[MoeMail] 加载配置错误:', error);
  }
}

/**
 * 保存 MoeMail API 配置
 */
async function saveMoeMailApiConfig() {
  const apiUrl = moemailApiUrlInput.value.trim();
  const apiKey = moemailApiKeyInput.value.trim();
  
  if (!apiUrl || !apiKey) {
    showMoeMailStatus('请填写完整的 API 配置', 'error');
    return;
  }
  
  try {
    await chrome.runtime.sendMessage({
      type: 'SET_MOEMAIL_CONFIG',
      apiUrl: apiUrl,
      apiKey: apiKey
    });
    
    moemailConfig.apiUrl = apiUrl;
    moemailConfig.apiKey = apiKey;
    
    showMoeMailStatus('API 配置已保存', 'success');
    
    // 自动测试连接
    await testMoeMailConnection();
  } catch (error) {
    console.error('[MoeMail] 保存配置错误:', error);
    showMoeMailStatus('保存失败: ' + error.message, 'error');
  }
}

/**
 * 测试 MoeMail API 连接
 */
async function testMoeMailConnection() {
  if (!moemailConfig.apiKey) {
    showMoeMailStatus('请先配置 API Key', 'error');
    return;
  }
  
  moemailTestConnectionBtn.disabled = true;
  moemailTestConnectionBtn.textContent = '测试中...';
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_MOEMAIL_CONNECTION',
      apiUrl: moemailConfig.apiUrl,
      apiKey: moemailConfig.apiKey
    });
    
    if (response.success) {
      moemailConfig.isConnected = true;
      showMoeMailStatus('✓ API 连接成功', 'success');
      
      // 加载域名列表
      await loadMoeMailDomains();
    } else {
      moemailConfig.isConnected = false;
      showMoeMailStatus('连接失败: ' + response.error, 'error');
    }
  } catch (error) {
    console.error('[MoeMail] 测试连接错误:', error);
    moemailConfig.isConnected = false;
    showMoeMailStatus('连接失败: ' + error.message, 'error');
  } finally {
    moemailTestConnectionBtn.disabled = false;
    moemailTestConnectionBtn.textContent = '测试';
  }
}

/**
 * 加载 MoeMail 域名列表
 */
async function loadMoeMailDomains() {
  if (!moemailConfig.isConnected) {
    return;
  }
  
  moemailDomainSelect.innerHTML = '<option value="">加载域名中...</option>';
  moemailRefreshDomainsBtn.disabled = true;
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_MOEMAIL_DOMAINS'
    });
    
    if (response.success && response.domains) {
      moemailDomainSelect.innerHTML = '';
      
      response.domains.forEach(domain => {
        const option = document.createElement('option');
        option.value = domain;
        option.textContent = '@' + domain;
        moemailDomainSelect.appendChild(option);
      });
      
      // 恢复之前选择的域名
      if (moemailConfig.domain) {
        moemailDomainSelect.value = moemailConfig.domain;
      } else if (response.domains.length > 0) {
        moemailDomainSelect.value = response.domains[0];
        moemailConfig.domain = response.domains[0];
      }
      
      updateMoeMailPreview();
    } else {
      moemailDomainSelect.innerHTML = '<option value="">加载失败</option>';
      showMoeMailStatus('域名加载失败: ' + response.error, 'error');
    }
  } catch (error) {
    console.error('[MoeMail] 加载域名错误:', error);
    moemailDomainSelect.innerHTML = '<option value="">加载失败</option>';
    showMoeMailStatus('域名加载失败: ' + error.message, 'error');
  } finally {
    moemailRefreshDomainsBtn.disabled = false;
  }
}

/**
 * 保存 MoeMail 配置
 */
async function saveMoeMailConfig(config) {
  try {
    await chrome.runtime.sendMessage({
      type: 'SET_MOEMAIL_CONFIG',
      ...config
    });
    
    // 更新本地配置
    Object.assign(moemailConfig, config);
  } catch (error) {
    console.error('[MoeMail] 保存配置错误:', error);
  }
}

/**
 * 更新邮箱预览
 */
function updateMoeMailPreview() {
  const domain = moemailDomainSelect.value;
  const prefix = moemailPrefixInput.value.trim();
  const randomLength = parseInt(moemailRandomLengthInput.value) || 5;
  
  if (!domain) {
    moemailPreviewText.textContent = '请先选择域名';
    moemailPreviewText.style.color = '#999';
    return;
  }
  
  // 生成随机字符串示例
  const randomStr = generateRandomString(randomLength);
  const username = prefix ? `${prefix}${randomStr}` : randomStr;
  const email = `${username}@${domain}`;
  
  moemailPreviewText.textContent = email;
  moemailPreviewText.style.color = '#232f3e';
}

/**
 * 生成随机字符串
 */
function generateRandomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 显示 MoeMail 状态提示
 */
function showMoeMailStatus(message, type = 'info') {
  moemailStatus.textContent = message;
  moemailStatus.className = `provider-desc ${type}`;
  moemailStatus.style.display = 'block';
  
  // 3秒后自动隐藏成功提示
  if (type === 'success') {
    setTimeout(() => {
      moemailStatus.style.display = 'none';
    }, 3000);
  }
}

/**
 * 保存 DuckMail 域名选择
 */
async function saveDuckMailDomain(domain) {
  try {
    await chrome.storage.local.set({ duckMailDomain: domain });
    await chrome.runtime.sendMessage({
      type: 'SET_DUCKMAIL_CONFIG',
      domain: domain
    });
    console.log('[DuckMail] 域名已保存:', domain);
  } catch (error) {
    console.error('[DuckMail] 保存域名错误:', error);
  }
}

// ==================== Token Pool 功能（继续） ====================

/**
 * 加载 Token Pool 配置
 */
async function loadPoolConfig() {
  try {
    const result = await chrome.storage.local.get(['poolApiKey']);
    if (result.poolApiKey) {
      poolApiKey = result.poolApiKey;
      poolApiKeyInput.value = poolApiKey;
      await connectToPool();
    }
  } catch (error) {
    console.error('[Pool] 加载配置错误:', error);
  }
}

/**
 * 连接到 Token Pool
 */
async function connectToPool() {
  const apiKey = poolApiKeyInput.value.trim();
  if (!apiKey) {
    alert('请输入 API Key');
    return;
  }

  poolConnectBtn.disabled = true;
  poolConnectBtn.textContent = '连接中...';

  try {
    const response = await fetch(`${POOL_API_URL}/api/cli/profile`, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey
      }
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || '连接失败');
    }

    const user = await response.json();
    poolApiKey = apiKey;
    poolUser = user;

    // 保存到 storage
    await chrome.storage.local.set({ poolApiKey: apiKey });

    // 更新 UI
    updatePoolUI();

  } catch (error) {
    console.error('[Pool] 连接错误:', error);
    alert('连接失败: ' + error.message);
  } finally {
    poolConnectBtn.disabled = false;
    poolConnectBtn.textContent = '连接';
  }
}

/**
 * 断开 Token Pool 连接
 */
async function disconnectFromPool() {
  poolApiKey = '';
  poolUser = null;
  await chrome.storage.local.remove(['poolApiKey']);
  poolApiKeyInput.value = '';
  updatePoolUI();
}

/**
 * 更新 Token Pool UI
 */
function updatePoolUI() {
  if (poolUser) {
    poolConfig.style.display = 'none';
    poolUserInfo.style.display = 'flex';
    poolUsername.textContent = poolUser.username || poolUser.email;
    poolPoints.textContent = `${poolUser.points} 积分`;
    poolUploadBtn.style.display = 'inline-flex';
  } else {
    poolConfig.style.display = 'block';
    poolUserInfo.style.display = 'none';
    poolUploadBtn.style.display = 'none';
  }
}

/**
 * 上传有效 Token 至 Pool
 */
async function uploadToPool() {
  if (!poolApiKey || !poolUser) {
    alert('请先连接 Token Pool');
    return;
  }

  try {
    // 获取历史记录
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_HISTORY' });
    const history = response.history || [];

    // 过滤有效的 Token
    const validRecords = history.filter(r =>
      r.success &&
      r.token &&
      r.tokenStatus === 'valid'
    );

    if (validRecords.length === 0) {
      alert('没有可上传的有效 Token\n\n请先验证 Token 状态');
      return;
    }

    if (!confirm(`确定上传 ${validRecords.length} 个有效 Token 至 Pool？`)) {
      return;
    }

    poolUploadBtn.disabled = true;
    poolUploadBtn.textContent = '上传中...';

    // 准备上传数据
    const tokens = validRecords.map(r => ({
      email: r.email,
      clientId: r.token.clientId,
      clientSecret: r.token.clientSecret,
      accessToken: r.token.accessToken,
      refreshToken: r.token.refreshToken
    }));

    // 上传
    const uploadResponse = await fetch(`${POOL_API_URL}/api/cli/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': poolApiKey
      },
      body: JSON.stringify({ tokens })
    });

    const result = await uploadResponse.json();

    if (!uploadResponse.ok) {
      throw new Error(result.error || '上传失败');
    }

    // 更新积分显示
    if (result.current_points !== undefined) {
      poolUser.points = result.current_points;
      poolPoints.textContent = `${poolUser.points} 积分`;
    }

    // 构建结果消息
    let message = '上传成功！\n\n';
    if (result.new_count > 0) message += `新增: ${result.new_count}\n`;
    if (result.update_count > 0) message += `更新: ${result.update_count}\n`;
    if (result.skip_count > 0) message += `跳过: ${result.skip_count}\n`;
    if (result.valid_count > 0) message += `有效: ${result.valid_count}\n`;
    if (result.points_earned > 0) message += `\n获得 ${result.points_earned} 积分`;

    alert(message);

  } catch (error) {
    console.error('[Pool] 上传错误:', error);
    alert('上传失败: ' + error.message);
  } finally {
    poolUploadBtn.disabled = false;
    poolUploadBtn.textContent = '上传';
  }
}

/**
 * 初始化
 */
async function init() {
  // 获取当前状态
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (response?.state) {
      updateUI(response.state);
    }
  } catch (error) {
    console.error('[Popup] 获取状态错误:', error);
  }

  // 加载邮箱渠道配置
  await loadProviderConfig();

  // 加载 Gmail 配置
  await loadGmailConfig();

  // 加载 Gmail API 配置
  await loadGmailApiConfig();

  // 加载 GPTMail 配置
  await loadGptmailConfig();

  // 加载 DuckMail 配置
  await loadDuckMailConfig();

  // 加载 Token Pool 配置
  await loadPoolConfig();

  // 监听状态更新
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATE') {
      updateUI(message.state);
    }
  });

  // 绑定按钮事件
  startBtn.addEventListener('click', startRegistration);
  stopBtn.addEventListener('click', stopRegistration);
  resetBtn.addEventListener('click', reset);
  exportBtn.addEventListener('click', exportHistory);
  exportCsvBtn.addEventListener('click', exportHistoryCSV);
  clearBtn.addEventListener('click', clearHistory);
  validateBtn.addEventListener('click', validateAllTokens);

  // 渠道选择事件
  mailProviderSelect.addEventListener('change', (e) => {
    const providerId = e.target.value;
    switchProviderPanel(providerId);
    saveProviderConfig(providerId);
  });

  // Gmail 配置事件
  gmailSaveBtn.addEventListener('click', saveGmailConfig);
  gmailAddressInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveGmailConfig();
    }
  });

  // Gmail API 授权事件
  gmailAuthBtn.addEventListener('click', authorizeGmailApi);
  gmailSenderSaveBtn.addEventListener('click', saveGmailSender);

  // GPTMail 配置事件
  gptmailSaveBtn.addEventListener('click', saveGptmailConfig);
  gptmailApiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveGptmailConfig();
    }
  });

  // DuckMail 配置事件
  duckMailApiKeySaveBtn.addEventListener('click', saveDuckMailApiKey);
  duckMailApiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveDuckMailApiKey();
    }
  });
  duckMailDomainSelect.addEventListener('change', (e) => {
    saveDuckMailDomain(e.target.value);
  });
  duckMailRefreshDomainsBtn.addEventListener('click', loadDuckMailDomains);

  // MoeMail 配置事件
  moemailSaveApiBtn.addEventListener('click', saveMoeMailApiConfig);
  moemailTestConnectionBtn.addEventListener('click', testMoeMailConnection);
  moemailRefreshDomainsBtn.addEventListener('click', loadMoeMailDomains);
  moemailApiUrlInput.addEventListener('blur', () => {
    const url = moemailApiUrlInput.value.trim();
    if (url) {
      moemailConfig.apiUrl = url;
      chrome.runtime.sendMessage({ type: 'SET_MOEMAIL_CONFIG', apiUrl: url });
    }
  });
  moemailApiKeyInput.addEventListener('blur', () => {
    const key = moemailApiKeyInput.value.trim();
    if (key) {
      moemailConfig.apiKey = key;
      chrome.runtime.sendMessage({ type: 'SET_MOEMAIL_CONFIG', apiKey: key });
    }
  });
  moemailApiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveMoeMailApiConfig();
    }
  });
  moemailDomainSelect.addEventListener('change', (e) => {
    saveMoeMailConfig({ domain: e.target.value });
    updateMoeMailPreview();
  });
  moemailPrefixInput.addEventListener('input', (e) => {
    saveMoeMailConfig({ prefix: e.target.value });
    updateMoeMailPreview();
  });
  moemailRandomLengthInput.addEventListener('input', (e) => {
    saveMoeMailConfig({ randomLength: parseInt(e.target.value) || 5 });
    updateMoeMailPreview();
  });
  moemailDurationSelect.addEventListener('change', (e) => {
    saveMoeMailConfig({ duration: parseInt(e.target.value) });
  });

  // Token Pool 事件
  poolConnectBtn.addEventListener('click', connectToPool);
  poolDisconnectBtn.addEventListener('click', disconnectFromPool);
  poolUploadBtn.addEventListener('click', uploadToPool);

  // 授权页拒绝开关
  const denyAccessToggle = document.getElementById('deny-access-toggle');
  chrome.runtime.sendMessage({ type: 'GET_DENY_ACCESS' }).then(res => {
    if (res) denyAccessToggle.checked = res.denyAccess;
  }).catch(() => {});
  denyAccessToggle.addEventListener('change', () => {
    chrome.runtime.sendMessage({ type: 'SET_DENY_ACCESS', value: denyAccessToggle.checked });
  });

  // 代理配置
  const proxyEnabledToggle = document.getElementById('proxy-enabled-toggle');
  const proxyConfigPanel = document.getElementById('proxy-config-panel');
  const proxyManualListInput = document.getElementById('proxy-manual-list');
  const proxyParsedCount = document.getElementById('proxy-parsed-count');
  const proxyApiUrlInput = document.getElementById('proxy-api-url');
  const proxyApiKeyInput = document.getElementById('proxy-api-key');
  const proxyTestBtn = document.getElementById('proxy-test-btn');
  const proxyStatus = document.getElementById('proxy-status');
  const proxyUsageLimitInput = document.getElementById('proxy-usage-limit');
  const pageTimeoutInput = document.getElementById('page-timeout-input');

  chrome.runtime.sendMessage({ type: 'GET_PROXY_CONFIG' }).then(res => {
    if (res) {
      proxyEnabledToggle.checked = res.proxyEnabled;
      proxyApiUrlInput.value = res.proxyApiUrl || '';
      proxyApiKeyInput.value = res.proxyApiKey || '';
      proxyManualListInput.value = res.proxyManualRaw || '';
      proxyConfigPanel.style.display = res.proxyEnabled ? 'block' : 'none';
      proxyUsageLimitInput.value = res.proxyUsageLimit || 1;
      pageTimeoutInput.value = Math.round((res.pageTimeoutMs || 300000) / 1000);
      if (res.deadProxies) renderDeadProxies(res.deadProxies);
      if (res.ipDetectApis) renderIpDetectCheckboxes(res.ipDetectApis, res.ipDetectEnabled || []);
      if (res.parsedCount > 0) {
        proxyParsedCount.textContent = `已解析 ${res.parsedCount} 个代理`;
        proxyParsedCount.style.color = 'green';
      }
    }
  }).catch(() => {});

  proxyEnabledToggle.addEventListener('change', () => {
    const enabled = proxyEnabledToggle.checked;
    proxyConfigPanel.style.display = enabled ? 'block' : 'none';
    chrome.runtime.sendMessage({ type: 'SET_PROXY_CONFIG', enabled });
  });

  proxyManualListInput.addEventListener('blur', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'SET_PROXY_CONFIG', manualRaw: proxyManualListInput.value });
    if (res?.parsedCount !== undefined) {
      proxyParsedCount.textContent = res.parsedCount > 0 ? `已解析 ${res.parsedCount} 个代理` : '未检测到有效代理';
      proxyParsedCount.style.color = res.parsedCount > 0 ? 'green' : 'red';
    }
  });

  proxyApiUrlInput.addEventListener('blur', () => {
    chrome.runtime.sendMessage({ type: 'SET_PROXY_CONFIG', apiUrl: proxyApiUrlInput.value });
  });
  proxyApiKeyInput.addEventListener('blur', () => {
    chrome.runtime.sendMessage({ type: 'SET_PROXY_CONFIG', apiKey: proxyApiKeyInput.value });
  });
  proxyUsageLimitInput.addEventListener('change', () => {
    chrome.runtime.sendMessage({ type: 'SET_PROXY_CONFIG', usageLimit: parseInt(proxyUsageLimitInput.value) || 1 });
  });
  pageTimeoutInput.addEventListener('change', () => {
    chrome.runtime.sendMessage({ type: 'SET_PROXY_CONFIG', pageTimeout: (parseInt(pageTimeoutInput.value) || 300) * 1000 });
  });

  // IP 检测 API 勾选
  const ipDetectContainer = document.getElementById('ip-detect-checkboxes');
  function renderIpDetectCheckboxes(apis, enabled) {
    ipDetectContainer.innerHTML = apis.map(a =>
      `<label style="font-size: 11px; display: flex; align-items: center; gap: 2px;">
        <input type="checkbox" class="ip-detect-cb" value="${a.id}" ${enabled.includes(a.id) ? 'checked' : ''}> ${a.label}
      </label>`
    ).join('');
  }
  ipDetectContainer.addEventListener('change', () => {
    const checked = [...ipDetectContainer.querySelectorAll('.ip-detect-cb:checked')].map(cb => cb.value);
    chrome.runtime.sendMessage({ type: 'SET_PROXY_CONFIG', ipDetectEnabled: checked });
  });

  proxyTestBtn.addEventListener('click', async () => {
    proxyStatus.textContent = '测试中...';
    proxyStatus.style.color = '#666';
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'TEST_PROXY_API',
        apiUrl: proxyApiUrlInput.value,
        apiKey: proxyApiKeyInput.value
      });
      if (res?.success) {
        proxyStatus.textContent = '连接成功: ' + (typeof res.data === 'string' ? res.data.substring(0, 50) : JSON.stringify(res.data).substring(0, 50));
        proxyStatus.style.color = 'green';
      } else {
        proxyStatus.textContent = '失败: ' + (res?.error || '未知错误');
        proxyStatus.style.color = 'red';
      }
    } catch (e) {
      proxyStatus.textContent = '失败: ' + e.message;
      proxyStatus.style.color = 'red';
    }
  });

  // 不可用代理管理
  const proxyDeadSection = document.getElementById('proxy-dead-section');
  const proxyDeadCount = document.getElementById('proxy-dead-count');
  const proxyDeadList = document.getElementById('proxy-dead-list');
  const proxyClearDeadBtn = document.getElementById('proxy-clear-dead-btn');

  function renderDeadProxies(deadList) {
    if (!deadList || deadList.length === 0) {
      proxyDeadSection.style.display = 'none';
      return;
    }
    proxyDeadSection.style.display = 'block';
    proxyDeadCount.textContent = `${deadList.length} 个代理不可用`;
    proxyDeadList.innerHTML = deadList.map(key =>
      `<div class="proxy-dead-item"><span title="${key}">${key}</span><button data-key="${key}" title="恢复此代理">&#x2713;</button></div>`
    ).join('');
  }

  proxyDeadList.addEventListener('click', async (e) => {
    if (e.target.tagName === 'BUTTON') {
      const key = e.target.getAttribute('data-key');
      const res = await chrome.runtime.sendMessage({ type: 'REVIVE_PROXY', proxyKey: key });
      if (res?.deadProxies) renderDeadProxies(res.deadProxies);
    }
  });

  proxyClearDeadBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_DEAD_PROXIES' });
    renderDeadProxies([]);
  });

  // 绑定复制按钮事件
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const targetElement = document.getElementById(targetId);
      if (targetElement && targetElement.textContent !== '-') {
        copyToClipboard(targetElement.textContent, btn);
      }
    });
  });
}

// 启动
document.addEventListener('DOMContentLoaded', init);
