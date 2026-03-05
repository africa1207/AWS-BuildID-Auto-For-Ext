/**
 * i18n Helper - Automatically replaces text content with localized messages
 */

// Current locale storage
let currentLocale = 'zh_CN';

// Load saved locale
async function loadLocale() {
  const result = await chrome.storage.local.get(['appLocale']);
  currentLocale = result.appLocale || 'zh_CN';
  return currentLocale;
}

// Save locale
async function saveLocale(locale) {
  currentLocale = locale;
  await chrome.storage.local.set({ appLocale: locale });
}

// Get message from specific locale
function getMessageFromLocale(key, locale) {
  const messages = {
    'zh_CN': {
      'extName': 'AWS Auto Registration',
      'appTitle': 'AWS 自动注册',
      'appSubtitle': 'Builder ID 一键注册工具',
      'statusReady': '准备就绪',
      'statusRunning': '注册进行中',
      'statusCompleted': '全部完成',
      'statusError': '发生错误',
      'statusValidating': '正在验证...',
      'sessionsTitle': '运行中的会话',
      'mailConfigTitle': '邮箱配置',
      'mailProviderLabel': '邮箱渠道',
      'mailProviderGmail': 'Gmail (需配置)',
      'mailProviderGuerrilla': 'Guerrilla Mail (免配置)',
      'mailProviderGptmail': 'GPTMail (需 API Key)',
      'mailProviderDuckmail': 'DuckMail (可选 API Key)',
      'mailProviderMoemail': 'MoeMail (需 API Key)',
      'mailProviderTempService': 'Temp-Service (需配置)',
      'gmailPlaceholder': '输入你的 Gmail 地址',
      'btnSave': '保存',
      'btnAuthorize': '授权 Gmail API',
      'btnReauthorize': '重新授权',
      'gmailAuthStatus': '✓ 已授权',
      'gmailSenderPlaceholder': '验证码发件人',
      'gmailHint': '授权后可自动获取验证码，无需手动填写',
      'guerrillaInfo': '✓ 无需配置，自动生成临时邮箱',
      'guerrillaDesc': '每次注册自动获取新的临时邮箱地址，验证码自动获取',
      'gptmailApiKeyPlaceholder': 'API Key (默认: gpt-test)',
      'gptmailHint': '✓ 自动随机生成邮箱，验证码自动获取',
      'gptmailDesc': '默认使用测试 Key，每日限 20 万次调用',
      'duckmailApiKeyPlaceholder': 'API Key (可选，以 dk_ 开头)',
      'duckmailHint': '✓ 随机用户名，验证码自动获取',
      'duckmailDesc': '不填 API Key 可用公共域名，填写后可用私有域名',
      'btnRefresh': '刷新',
      'loadingDomains': '加载域名中...',
      'moemailApiUrlPlaceholder': 'http://your-api-url',
      'btnTest': '测试',
      'moemailApiKeyPlaceholder': 'API Key (必填)',
      'moemailDuration1h': '1小时',
      'moemailDuration1d': '1天',
      'moemailDuration7d': '7天',
      'moemailDurationPermanent': '永久',
      'moemailPrefixPlaceholder': '固定前缀 (可选)',
      'moemailRandomLengthPlaceholder': '随机位数',
      'moemailPreviewLabel': '预览:',
      'moemailHint': '✓ 自定义邮箱前缀和域名，验证码自动获取',
      'tempServiceBaseUrlPlaceholder': 'TEMP_MAIL_BASE_URL (https://...)',
      'tempServiceAdminAuthPlaceholder': 'TEMP_MAIL_ADMIN_AUTH',
      'tempServiceCustomAuthPlaceholder': 'TEMP_MAIL_CUSTOM_AUTH (可选)',
      'tempServiceDomainPlaceholder': 'TEMP_MAIL_DOMAIN (例如 opena1.tech)',
      'tempServicePrefixPlaceholder': 'TEMP_MAIL_NAME_PREFIX (默认 oc)',
      'tempServiceHint': '✓ 自建临时邮箱，验证码自动获取，注册后自动删除邮箱',
      'settingsTitle': '设置',
      'labelRegCount': '注册数量',
      'labelConcurrency': '并发窗口',
      'settingsHint': '⚠️ 使用 Gmail 别名模式时，建议并发设为 1',
      'labelDenyAccess': '授权页点击拒绝（增强账号安全）',
      'labelProxyEnabled': '启用代理提取',
      'proxyManualPlaceholder': '手动代理列表（每行一个）\n格式: socks5://ip:port\nhttp://user:pass@ip:port\nip:port',
      'labelProxyUsageLimit': '单代理注册次数:',
      'labelIpDetectApi': 'IP 检测 API:',
      'labelPageTimeout': '页面超时(秒):',
      'proxyApiUrlPlaceholder': '代理提取 API 地址（可选）',
      'proxyApiKeyPlaceholder': 'API Key（可选）',
      'btnStart': '开始注册',
      'btnStop': '停止',
      'btnReset': '重新开始',
      'currentAccountTitle': '当前账号',
      'labelEmail': '邮箱',
      'labelPassword': '密码',
      'btnCopy': '复制',
      'btnCopied': '已复制',
      'tokenTitle': 'Token',
      'labelAccessToken': 'Access Token',
      'historyTitle': '注册历史',
      'btnValidate': '验证',
      'btnExportJson': 'JSON',
      'btnExportCsv': 'CSV',
      'btnClear': '清空',
      'historyEmpty': '暂无记录',
      'tokenStatusValid': '有效',
      'tokenStatusSuspended': '封禁',
      'tokenStatusExpired': '过期',
      'tokenStatusInvalid': '无效',
      'tokenStatusError': '错误',
      'tokenStatusUnknown': '未验证',
      'btnKiro': 'Kiro',
      'btnJson': 'JSON',
      'btnDelete': '删除',
      'tokenPoolTitle': 'Token Pool',
      'btnUpload': '上传',
      'poolApiKeyPlaceholder': '输入 API Key',
      'btnConnect': '连接',
      'poolHint': '在 Token Pool 网站生成 API Key',
      'btnDisconnect': '断开',
      'labelPoints': '积分',
      'footerText': '无痕模式需在扩展设置中启用',
      'languageLabel': '语言'
    },
    'en': {
      'extName': 'AWS Auto Registration',
      'appTitle': 'AWS Auto Registration',
      'appSubtitle': 'Builder ID One-Click Registration Tool',
      'statusReady': 'Ready',
      'statusRunning': 'Registration in Progress',
      'statusCompleted': 'Completed',
      'statusError': 'Error Occurred',
      'statusValidating': 'Validating...',
      'sessionsTitle': 'Running Sessions',
      'mailConfigTitle': 'Email Configuration',
      'mailProviderLabel': 'Email Provider',
      'mailProviderGmail': 'Gmail (Configuration Required)',
      'mailProviderGuerrilla': 'Guerrilla Mail (No Configuration)',
      'mailProviderGptmail': 'GPTMail (API Key Required)',
      'mailProviderDuckmail': 'DuckMail (Optional API Key)',
      'mailProviderMoemail': 'MoeMail (API Key Required)',
      'mailProviderTempService': 'Temp-Service (Configuration Required)',
      'gmailPlaceholder': 'Enter your Gmail address',
      'btnSave': 'Save',
      'btnAuthorize': 'Authorize Gmail API',
      'btnReauthorize': 'Reauthorize',
      'gmailAuthStatus': '✓ Authorized',
      'gmailSenderPlaceholder': 'Verification code sender',
      'gmailHint': 'Verification code will be automatically retrieved after authorization',
      'guerrillaInfo': '✓ No configuration needed, automatic temporary email',
      'guerrillaDesc': 'Automatically gets new temporary email address for each registration, verification code automatic',
      'gptmailApiKeyPlaceholder': 'API Key (default: gpt-test)',
      'gptmailHint': '✓ Automatic random email, verification code automatic',
      'gptmailDesc': 'Uses test Key by default, 200,000 calls per day limit',
      'duckmailApiKeyPlaceholder': 'API Key (optional, starts with dk_)',
      'duckmailHint': '✓ Random username, verification code automatic',
      'duckmailDesc': 'Public domain without API Key, private domain with API Key',
      'btnRefresh': 'Refresh',
      'loadingDomains': 'Loading domains...',
      'moemailApiUrlPlaceholder': 'http://your-api-url',
      'btnTest': 'Test',
      'moemailApiKeyPlaceholder': 'API Key (required)',
      'moemailDuration1h': '1 hour',
      'moemailDuration1d': '1 day',
      'moemailDuration7d': '7 days',
      'moemailDurationPermanent': 'Permanent',
      'moemailPrefixPlaceholder': 'Fixed prefix (optional)',
      'moemailRandomLengthPlaceholder': 'Random length',
      'moemailPreviewLabel': 'Preview:',
      'moemailHint': '✓ Custom email prefix and domain, verification code automatic',
      'tempServiceBaseUrlPlaceholder': 'TEMP_MAIL_BASE_URL (https://...)',
      'tempServiceAdminAuthPlaceholder': 'TEMP_MAIL_ADMIN_AUTH',
      'tempServiceCustomAuthPlaceholder': 'TEMP_MAIL_CUSTOM_AUTH (optional)',
      'tempServiceDomainPlaceholder': 'TEMP_MAIL_DOMAIN (e.g. opena1.tech)',
      'tempServicePrefixPlaceholder': 'TEMP_MAIL_NAME_PREFIX (default oc)',
      'tempServiceHint': '✓ Self-hosted temp mail, auto code fetch, auto delete after registration',
      'settingsTitle': 'Settings',
      'labelRegCount': 'Registration Count',
      'labelConcurrency': 'Concurrent Windows',
      'settingsHint': '⚠️ Set concurrency to 1 when using Gmail alias mode',
      'labelDenyAccess': 'Click deny on authorization page (enhances account security)',
      'labelProxyEnabled': 'Enable proxy extraction',
      'proxyManualPlaceholder': 'Manual proxy list (one per line)\nFormat: socks5://ip:port\nhttp://user:pass@ip:port\nip:port',
      'labelProxyUsageLimit': 'Registrations per proxy:',
      'labelIpDetectApi': 'IP Detection API:',
      'labelPageTimeout': 'Page timeout (seconds):',
      'proxyApiUrlPlaceholder': 'Proxy extraction API address (optional)',
      'proxyApiKeyPlaceholder': 'API Key (optional)',
      'btnStart': 'Start Registration',
      'btnStop': 'Stop',
      'btnReset': 'Restart',
      'currentAccountTitle': 'Current Account',
      'labelEmail': 'Email',
      'labelPassword': 'Password',
      'btnCopy': 'Copy',
      'btnCopied': 'Copied',
      'tokenTitle': 'Token',
      'labelAccessToken': 'Access Token',
      'historyTitle': 'Registration History',
      'btnValidate': 'Validate',
      'btnExportJson': 'JSON',
      'btnExportCsv': 'CSV',
      'btnClear': 'Clear',
      'historyEmpty': 'No records yet',
      'tokenStatusValid': 'Valid',
      'tokenStatusSuspended': 'Suspended',
      'tokenStatusExpired': 'Expired',
      'tokenStatusInvalid': 'Invalid',
      'tokenStatusError': 'Error',
      'tokenStatusUnknown': 'Not Validated',
      'btnKiro': 'Kiro',
      'btnJson': 'JSON',
      'btnDelete': 'Delete',
      'tokenPoolTitle': 'Token Pool',
      'btnUpload': 'Upload',
      'poolApiKeyPlaceholder': 'Enter API Key',
      'btnConnect': 'Connect',
      'poolHint': 'Generate API Key from Token Pool website',
      'btnDisconnect': 'Disconnect',
      'labelPoints': 'Points',
      'footerText': 'Incognito mode must be enabled in extension settings',
      'languageLabel': 'Language'
    },
    'tr': {
      'extName': 'AWS Otomatik Kayıt',
      'appTitle': 'AWS Otomatik Kayıt',
      'appSubtitle': 'Builder ID Tek Tıkla Kayıt Aracı',
      'statusReady': 'Hazır',
      'statusRunning': 'Kayıt Devam Ediyor',
      'statusCompleted': 'Tamamlandı',
      'statusError': 'Hata Oluştu',
      'statusValidating': 'Doğrulanıyor...',
      'sessionsTitle': 'Çalışan Oturumlar',
      'mailConfigTitle': 'E-posta Yapılandırması',
      'mailProviderLabel': 'E-posta Sağlayıcı',
      'mailProviderGmail': 'Gmail (Yapılandırma Gerekli)',
      'mailProviderGuerrilla': 'Guerrilla Mail (Yapılandırma Gerektirmez)',
      'mailProviderGptmail': 'GPTMail (API Key Gerekli)',
      'mailProviderDuckmail': 'DuckMail (İsteğe Bağlı API Key)',
      'mailProviderMoemail': 'MoeMail (API Key Gerekli)',
      'mailProviderTempService': 'Temp-Service (Ayar Gerekli)',
      'gmailPlaceholder': 'Gmail adresinizi girin',
      'btnSave': 'Kaydet',
      'btnAuthorize': 'Gmail API Yetkilendir',
      'btnReauthorize': 'Yeniden Yetkilendir',
      'gmailAuthStatus': '✓ Yetkilendirildi',
      'gmailSenderPlaceholder': 'Doğrulama kodu gönderen',
      'gmailHint': 'Yetkilendirme sonrası doğrulama kodu otomatik alınır',
      'guerrillaInfo': '✓ Yapılandırma gerektirmez, otomatik geçici e-posta',
      'guerrillaDesc': 'Her kayıtta otomatik yeni geçici e-posta adresi, doğrulama kodu otomatik',
      'gptmailApiKeyPlaceholder': 'API Key (varsayılan: gpt-test)',
      'gptmailHint': '✓ Otomatik rastgele e-posta, doğrulama kodu otomatik',
      'gptmailDesc': 'Varsayılan test Key kullanır, günlük 200.000 çağrı limiti',
      'duckmailApiKeyPlaceholder': 'API Key (isteğe bağlı, dk_ ile başlar)',
      'duckmailHint': '✓ Rastgele kullanıcı adı, doğrulama kodu otomatik',
      'duckmailDesc': 'API Key olmadan genel domain, API Key ile özel domain',
      'btnRefresh': 'Yenile',
      'loadingDomains': "Domain'ler yükleniyor...",
      'moemailApiUrlPlaceholder': 'http://api-url-adresiniz',
      'btnTest': 'Test',
      'moemailApiKeyPlaceholder': 'API Key (zorunlu)',
      'moemailDuration1h': '1 saat',
      'moemailDuration1d': '1 gün',
      'moemailDuration7d': '7 gün',
      'moemailDurationPermanent': 'Kalıcı',
      'moemailPrefixPlaceholder': 'Sabit önek (isteğe bağlı)',
      'moemailRandomLengthPlaceholder': 'Rastgele karakter sayısı',
      'moemailPreviewLabel': 'Önizleme:',
      'moemailHint': '✓ Özel e-posta öneki ve domain, doğrulama kodu otomatik',
      'tempServiceBaseUrlPlaceholder': 'TEMP_MAIL_BASE_URL (https://...)',
      'tempServiceAdminAuthPlaceholder': 'TEMP_MAIL_ADMIN_AUTH',
      'tempServiceCustomAuthPlaceholder': 'TEMP_MAIL_CUSTOM_AUTH (isteğe bağlı)',
      'tempServiceDomainPlaceholder': 'TEMP_MAIL_DOMAIN (örn. opena1.tech)',
      'tempServicePrefixPlaceholder': 'TEMP_MAIL_NAME_PREFIX (varsayılan oc)',
      'tempServiceHint': '✓ Kendi temp mail servisiniz, kod otomatik, kayıt sonrası otomatik silme',
      'settingsTitle': 'Ayarlar',
      'labelRegCount': 'Kayıt Sayısı',
      'labelConcurrency': 'Eşzamanlı Pencere',
      'settingsHint': '⚠️ Gmail takma ad modunda eşzamanlılığı 1\'e ayarlayın',
      'labelDenyAccess': 'Yetkilendirme sayfasında reddet (hesap güvenliğini artırır)',
      'labelProxyEnabled': 'Proxy çıkarımını etkinleştir',
      'proxyManualPlaceholder': 'Manuel proxy listesi (her satırda bir)\nFormat: socks5://ip:port\nhttp://user:pass@ip:port\nip:port',
      'labelProxyUsageLimit': 'Proxy başına kayıt sayısı:',
      'labelIpDetectApi': 'IP Tespit API:',
      'labelPageTimeout': 'Sayfa zaman aşımı (saniye):',
      'proxyApiUrlPlaceholder': 'Proxy çıkarım API adresi (isteğe bağlı)',
      'proxyApiKeyPlaceholder': 'API Key (isteğe bağlı)',
      'btnStart': 'Kayda Başla',
      'btnStop': 'Durdur',
      'btnReset': 'Yeniden Başlat',
      'currentAccountTitle': 'Mevcut Hesap',
      'labelEmail': 'E-posta',
      'labelPassword': 'Şifre',
      'btnCopy': 'Kopyala',
      'btnCopied': 'Kopyalandı',
      'tokenTitle': 'Token',
      'labelAccessToken': 'Access Token',
      'historyTitle': 'Kayıt Geçmişi',
      'btnValidate': 'Doğrula',
      'btnExportJson': 'JSON',
      'btnExportCsv': 'CSV',
      'btnClear': 'Temizle',
      'historyEmpty': 'Henüz kayıt yok',
      'tokenStatusValid': 'Geçerli',
      'tokenStatusSuspended': 'Askıya Alındı',
      'tokenStatusExpired': 'Süresi Doldu',
      'tokenStatusInvalid': 'Geçersiz',
      'tokenStatusError': 'Hata',
      'tokenStatusUnknown': 'Doğrulanmadı',
      'btnKiro': 'Kiro',
      'btnJson': 'JSON',
      'btnDelete': 'Sil',
      'tokenPoolTitle': 'Token Pool',
      'btnUpload': 'Yükle',
      'poolApiKeyPlaceholder': 'API Key girin',
      'btnConnect': 'Bağlan',
      'poolHint': 'Token Pool web sitesinden API Key oluşturun',
      'btnDisconnect': 'Bağlantıyı Kes',
      'labelPoints': 'Puan',
      'footerText': 'Gizli mod eklenti ayarlarından etkinleştirilmelidir',
      'languageLabel': 'Dil'
    }
  };
  
  return messages[locale]?.[key] || key;
}

function initI18n() {
  // Replace all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const message = getMessageFromLocale(key, currentLocale);
    if (message) {
      if (element.tagName === 'OPTION') {
        element.textContent = message;
      } else {
        element.textContent = message;
      }
    }
  });

  // Replace all placeholders with data-i18n-placeholder attribute
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    const message = getMessageFromLocale(key, currentLocale);
    if (message) {
      element.placeholder = message;
    }
  });

  // Replace all titles with data-i18n-title attribute
  document.querySelectorAll('[data-i18n-title]').forEach(element => {
    const key = element.getAttribute('data-i18n-title');
    const message = getMessageFromLocale(key, currentLocale);
    if (message) {
      element.title = message;
    }
  });

  // Update document title
  document.title = getMessageFromLocale('extName', currentLocale);
  
  // Update HTML lang attribute based on current locale
  document.documentElement.lang = currentLocale.replace('_', '-');
  
  // Set language selector value
  const languageSelect = document.getElementById('language-select');
  if (languageSelect) {
    languageSelect.value = currentLocale;
  }
}

// Change language
async function changeLanguage(locale) {
  await saveLocale(locale);
  currentLocale = locale;
  initI18n();
  
  // Notify popup.js to update dynamic content
  window.dispatchEvent(new CustomEvent('languageChanged', { detail: { locale } }));
}

// Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    await loadLocale();
    initI18n();
    
    // Add language selector event listener
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
      languageSelect.addEventListener('change', (e) => {
        changeLanguage(e.target.value);
      });
    }
  });
} else {
  (async () => {
    await loadLocale();
    initI18n();
    
    // Add language selector event listener
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
      languageSelect.addEventListener('change', (e) => {
        changeLanguage(e.target.value);
      });
    }
  })();
}

// Export for use in popup.js
window.i18n = (key) => getMessageFromLocale(key, currentLocale);
window.getCurrentLocale = () => currentLocale;
