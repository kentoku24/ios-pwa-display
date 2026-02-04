/**
 * Display Controller - 全体を統括するコントローラー
 */

import { NoSleepManager } from '../services/nosleep-manager';
import { BrightnessDetector, type BrightnessCallback } from '../services/brightness-detector';
import { MessageClient, type DisplayMessage, type ConnectionState } from '../services/message-client';
import { SoundManager } from '../services/sound-manager';

export interface DisplayConfig {
  wsUrl: string;
  brightnessMode: 'auto' | 'light' | 'dark';
}

export interface DisplayState {
  initialized: boolean;
  connected: ConnectionState;
  brightnessMode: 'auto' | 'light' | 'dark';
  ambientLevel: number;
  cameraAvailable: boolean;
  currentMessage: DisplayMessage | null;
}

export type StateChangeHandler = (state: DisplayState) => void;

const STORAGE_KEY = 'ios-pwa-display-config';

export class DisplayController {
  private noSleep: NoSleepManager;
  private brightnessDetector: BrightnessDetector;
  private messageClient: MessageClient;
  private soundManager: SoundManager;

  private stateHandlers = new Set<StateChangeHandler>();
  private messageTimeoutId: number | null = null;

  private _state: DisplayState = {
    initialized: false,
    connected: 'disconnected',
    brightnessMode: 'auto',
    ambientLevel: 0.5,
    cameraAvailable: false,
    currentMessage: null,
  };

  constructor() {
    // 設定を復元
    const savedConfig = this.loadConfig();

    this.noSleep = new NoSleepManager();
    this.brightnessDetector = new BrightnessDetector({
      sampleIntervalMs: 3000,
      resolution: 32,
      smoothingWindow: 5,
    });
    this.messageClient = new MessageClient(savedConfig.wsUrl);
    this.soundManager = new SoundManager();

    this._state.brightnessMode = savedConfig.brightnessMode;

    // 接続状態の変更を監視
    this.messageClient.onConnectionChange((state) => {
      this._state.connected = state;
      this.notifyStateChange();
    });

    // メッセージの受信を監視
    this.messageClient.onMessage((msg) => this.handleMessage(msg));
  }

  get state(): DisplayState {
    return { ...this._state };
  }

  get wsUrl(): string {
    return this.messageClient.wsUrl;
  }

  /**
   * 設定を保存
   */
  private saveConfig(): void {
    const config: DisplayConfig = {
      wsUrl: this.messageClient.wsUrl,
      brightnessMode: this._state.brightnessMode,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  /**
   * 設定を読み込み
   */
  private loadConfig(): DisplayConfig {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.warn('[DisplayController] Failed to load config:', err);
    }
    // デフォルト設定
    return {
      wsUrl: '',
      brightnessMode: 'auto',
    };
  }

  /**
   * 設定を更新
   */
  updateConfig(config: Partial<DisplayConfig>): void {
    if (config.wsUrl !== undefined) {
      this.messageClient.wsUrl = config.wsUrl;
    }
    if (config.brightnessMode !== undefined) {
      this._state.brightnessMode = config.brightnessMode;
      this.applyBrightness(this._state.ambientLevel);
    }
    this.saveConfig();
    this.notifyStateChange();
  }

  /**
   * 初期化（ユーザージェスチャー内で呼ぶ）
   */
  async initialize(): Promise<void> {
    if (this._state.initialized) return;

    console.log('[DisplayController] Initializing...');

    // 1. スリープ防止を有効化
    await this.noSleep.enable();

    // 2. サウンドをアンロック
    await this.soundManager.unlock();

    // 3. 明るさ検出を開始（カメラ許可を求める）
    if (this._state.brightnessMode === 'auto') {
      const available = await this.brightnessDetector.start((level) => {
        this._state.ambientLevel = level;
        this.applyBrightness(level);
        this.notifyStateChange();
      });
      this._state.cameraAvailable = available;

      if (!available) {
        console.log('[DisplayController] Camera not available, using manual mode');
        // フォールバック: 時間帯に基づく自動切り替え
        this.applyTimeBasedBrightness();
      }
    } else {
      this.applyBrightness(this._state.brightnessMode === 'light' ? 1 : 0);
    }

    // 4. WebSocket 接続を開始
    if (this.messageClient.wsUrl) {
      this.messageClient.connect();
    }

    this._state.initialized = true;
    this.notifyStateChange();

    console.log('[DisplayController] Initialized');
  }

  /**
   * 明るさを適用
   */
  private applyBrightness(level: number): void {
    let effectiveLevel: number;

    switch (this._state.brightnessMode) {
      case 'light':
        effectiveLevel = 0.9;
        break;
      case 'dark':
        effectiveLevel = 0.1;
        break;
      case 'auto':
      default:
        effectiveLevel = level;
    }

    // CSS変数を更新
    document.documentElement.style.setProperty(
      '--ambient-brightness',
      effectiveLevel.toFixed(2)
    );
  }

  /**
   * 時間帯に基づく明るさ（カメラ不可時のフォールバック）
   */
  private applyTimeBasedBrightness(): void {
    const hour = new Date().getHours();
    // 6時〜18時は明るめ、それ以外は暗め
    const level = (hour >= 6 && hour < 18) ? 0.7 : 0.2;
    this._state.ambientLevel = level;
    this.applyBrightness(level);
    this.notifyStateChange();

    // 1時間ごとに更新
    setInterval(() => {
      if (this._state.brightnessMode === 'auto' && !this._state.cameraAvailable) {
        this.applyTimeBasedBrightness();
      }
    }, 3600000);
  }

  /**
   * メッセージを処理
   */
  private handleMessage(message: DisplayMessage): void {
    console.log('[DisplayController] Handling message:', message);

    // 前のタイマーをクリア
    if (this.messageTimeoutId) {
      clearTimeout(this.messageTimeoutId);
      this.messageTimeoutId = null;
    }

    // クリアメッセージ
    if (message.type === 'clear') {
      this._state.currentMessage = null;
      this.notifyStateChange();
      return;
    }

    // 設定メッセージ
    if (message.type === 'config') {
      // サーバーからの設定変更（将来用）
      return;
    }

    // 通常メッセージ
    this._state.currentMessage = message;

    // サウンド再生
    if (message.sound && message.sound !== 'none') {
      this.soundManager.play(message.sound);
    }

    // 一定時間後にクリア
    if (message.duration && message.duration > 0) {
      this.messageTimeoutId = window.setTimeout(() => {
        if (this._state.currentMessage === message) {
          this._state.currentMessage = null;
          this.notifyStateChange();
        }
      }, message.duration);
    }

    this.notifyStateChange();
  }

  /**
   * 状態変更ハンドラを登録
   */
  onStateChange(handler: StateChangeHandler): () => void {
    this.stateHandlers.add(handler);
    // 現在の状態を即座に通知
    handler(this.state);
    return () => this.stateHandlers.delete(handler);
  }

  /**
   * 状態変更を通知
   */
  private notifyStateChange(): void {
    const state = this.state;
    this.stateHandlers.forEach(h => h(state));
  }

  /**
   * 破棄
   */
  destroy(): void {
    this.noSleep.disable();
    this.brightnessDetector.stop();
    this.messageClient.disconnect();
    if (this.messageTimeoutId) {
      clearTimeout(this.messageTimeoutId);
    }
  }
}
