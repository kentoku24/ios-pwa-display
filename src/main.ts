/**
 * iOS PWA Display - メインエントリーポイント
 */

import { DisplayController, type DisplayState } from './controllers/display-controller';
import type { DisplayMessage } from './services/message-client';

// DOM要素
const initScreen = document.getElementById('init-screen')!;
const displayScreen = document.getElementById('display-screen')!;
const messageContent = document.getElementById('message-content')!;
const connectionStatus = document.getElementById('connection-status')!;
const brightnessValue = document.getElementById('brightness-value')!;
const settingsPanel = document.getElementById('settings-panel')!;
const wsUrlInput = document.getElementById('ws-url') as HTMLInputElement;
const brightnessModeSelect = document.getElementById('brightness-mode') as HTMLSelectElement;
const settingsSaveBtn = document.getElementById('settings-save')!;
const settingsCloseBtn = document.getElementById('settings-close')!;

// コントローラー
const controller = new DisplayController();

// 設定パネルのオーバーレイ
let overlay: HTMLDivElement | null = null;

/**
 * 初期化画面のタップハンドラ
 */
initScreen.addEventListener('click', async () => {
  try {
    initScreen.querySelector('.init-instruction')!.textContent = '初期化中...';
    await controller.initialize();
    
    // 画面を切り替え
    initScreen.classList.remove('active');
    displayScreen.classList.add('active');
  } catch (err) {
    console.error('Initialization failed:', err);
    initScreen.querySelector('.init-instruction')!.textContent = '初期化に失敗しました。タップして再試行';
  }
});

/**
 * 設定パネルを表示
 */
function showSettings(): void {
  // 現在の設定を反映
  wsUrlInput.value = controller.wsUrl;
  brightnessModeSelect.value = controller.state.brightnessMode;

  // オーバーレイ
  overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.addEventListener('click', hideSettings);
  document.body.appendChild(overlay);

  settingsPanel.classList.remove('hidden');
}

/**
 * 設定パネルを非表示
 */
function hideSettings(): void {
  settingsPanel.classList.add('hidden');
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

/**
 * 設定を保存
 */
settingsSaveBtn.addEventListener('click', () => {
  controller.updateConfig({
    wsUrl: wsUrlInput.value.trim(),
    brightnessMode: brightnessModeSelect.value as 'auto' | 'light' | 'dark',
  });

  // WebSocket 接続を開始
  if (wsUrlInput.value.trim() && controller.state.initialized) {
    // disconnect して再接続
    controller.updateConfig({ wsUrl: wsUrlInput.value.trim() });
  }

  hideSettings();
});

settingsCloseBtn.addEventListener('click', hideSettings);

/**
 * 長押しで設定パネルを表示
 */
let longPressTimer: number | null = null;

displayScreen.addEventListener('touchstart', (e) => {
  longPressTimer = window.setTimeout(() => {
    showSettings();
  }, 1000);
});

displayScreen.addEventListener('touchend', () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
});

displayScreen.addEventListener('touchmove', () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
});

// PC用: 右クリックで設定
displayScreen.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  showSettings();
});

/**
 * 状態変更の反映
 */
controller.onStateChange((state: DisplayState) => {
  // 接続状態
  connectionStatus.className = 'status-dot ' + state.connected;
  connectionStatus.title = {
    connected: '接続中',
    connecting: '接続試行中...',
    disconnected: '切断',
  }[state.connected];

  // 明るさ
  brightnessValue.textContent = `${Math.round(state.ambientLevel * 100)}%`;

  // メッセージ
  renderMessage(state.currentMessage);
});

/**
 * メッセージを描画
 */
function renderMessage(message: DisplayMessage | null): void {
  if (!message) {
    messageContent.innerHTML = '';
    messageContent.className = 'empty';
    return;
  }

  messageContent.className = '';

  // スタイルを適用
  if (message.style?.backgroundColor) {
    messageContent.style.backgroundColor = message.style.backgroundColor;
  } else {
    messageContent.style.backgroundColor = '';
  }

  if (message.style?.textColor) {
    messageContent.style.color = message.style.textColor;
  } else {
    messageContent.style.color = '';
  }

  switch (message.type) {
    case 'text':
      const sizeClass = message.style?.fontSize ? `size-${message.style.fontSize}` : '';
      messageContent.innerHTML = `<div class="message-text ${sizeClass}">${escapeHtml(message.content || '')}</div>`;
      break;

    case 'image':
      messageContent.innerHTML = `<img class="message-image" src="${escapeHtml(message.imageUrl || '')}" alt="">`;
      break;

    case 'alert':
      messageContent.innerHTML = `
        <div class="message-alert">
          <h2>${escapeHtml(message.title || 'Alert')}</h2>
          <p>${escapeHtml(message.body || message.content || '')}</p>
        </div>
      `;
      break;

    default:
      messageContent.innerHTML = `<div class="message-text">${escapeHtml(String(message.content || ''))}</div>`;
  }
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * PWAインストール促進（iOS Safari向け）
 */
function checkPWAInstall(): void {
  // スタンドアロンモードでなければ、インストールバナーを表示
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;

  if (!isStandalone && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    const banner = document.createElement('div');
    banner.id = 'install-banner';
    banner.innerHTML = `
      <p>📲 ホーム画面に追加</p>
      <small>共有ボタン → 「ホーム画面に追加」でアプリとして使えます</small>
    `;
    document.body.appendChild(banner);

    // 5秒後に非表示
    setTimeout(() => {
      banner.classList.add('hidden');
    }, 8000);

    // タップで非表示
    banner.addEventListener('click', () => {
      banner.classList.add('hidden');
    });
  }
}

// ページロード時
window.addEventListener('load', () => {
  checkPWAInstall();
});

// Service Worker 登録
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    console.log('Service Worker registered:', reg.scope);
  }).catch((err) => {
    console.warn('Service Worker registration failed:', err);
  });
}
