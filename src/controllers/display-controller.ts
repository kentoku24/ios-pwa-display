/**
 * Display Controller - 全体を統括するコントローラー
 */

import { NoSleepManager } from '../services/nosleep-manager';
import { BrightnessDetector } from '../services/brightness-detector';
import { MessageClient, type DisplayMessage, type ConnectionState } from '../services/message-client';
import { SSEClient, type PowerReadingEvent, type SSEConnectionState } from '../services/sse-client';
import { SoundManager } from '../services/sound-manager';

export interface DisplayConfig {
  wsUrl: string;
  sseUrl: string;
  brightnessMode: 'auto' | 'light' | 'dark';
  alertThresholdWatts: number;  // この値を超えたらアラート
}

export interface DisplayState {
  initialized: boolean;
  wsConnected: ConnectionState;
  sseConnected: SSEConnectionState;
  brightnessMode: 'auto' | 'light' | 'dark';
  ambientLevel: number;
  cameraAvailable: boolean;
  currentMessage: DisplayMessage | null;
  currentPower: PowerReadingEvent | null;
}

export type StateChangeHandler = (state: DisplayState) => void;

const STORAGE_KEY = 'ios-pwa-display-config';
const DEFAULT_ALERT_THRESHOLD = 2000; // 2000W

export class DisplayController {
  private noSleep: NoSleepManager;
  private brightnessDetector: BrightnessDetector;
  private messageClient: MessageClient;
  private sseClient: SSEClient;
  private soundManager: SoundManager;

  private stateHandlers = new Set<StateChangeHandler>();
  private messageTimeoutId: number | null = null;
  private alertThresholdWatts: number;

  private _state: DisplayState = {
    initialized: false,
    wsConnected: 'disconnected',
    sseConnected: 'disconnected',
    brightnessMode: 'auto',
    ambientLevel: 0.5,
    cameraAvailable: false,
    currentMessage: null,
    currentPower: null,
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
    this.sseClient = new SSEClient(savedConfig.sseUrl);
    this.soundManager = new SoundManager();

    this._state.brightnessMode = savedConfig.brightnessMode;
    this.alertThresholdWatts = savedConfig.alertThresholdWatts;

    // WebSocket 接続状態の変更を監視
    this.messageClient.onConnectionChange((state) => {
      this._state.wsConnected = state;
      this.notifyStateChange();
    });

    // WebSocket メッセージの受信を監視
    this.messageClient.onMessage((msg) => this.handleMessage(msg));

    // SSE 接続状態の変更を監視
    this.sseClient.onConnectionChange((state) => {
      this._state.sseConnected = state;
      this.notifyStateChange();
    });

    // SSE 電力データの受信を監視
    this.sseClient.onPowerReading((event) => this.handlePowerReading(event));
  }

  get state(): DisplayState {
    return { ...this._state };
  }

  get wsUrl(): string {
    return this.messageClient.wsUrl;
  }

  get sseUrl(): string {
    return this.sseClient.sseUrl;
  }

  /**
   * 設定を保存
   */
  private saveConfig(): void {
    const config: DisplayConfig = {
      wsUrl: this.messageClient.wsUrl,
      sseUrl: this.sseClient.sseUrl,
      brightnessMode: this._state.brightnessMode,
      alertThresholdWatts: this.alertThresholdWatts,
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
        const config = JSON.parse(saved);
        return {
          wsUrl: config.wsUrl || '',
          sseUrl: config.sseUrl || '',
          brightnessMode: config.brightnessMode || 'auto',
          alertThresholdWatts: config.alertThresholdWatts || DEFAULT_ALERT_THRESHOLD,
        };
      }
    } catch (err) {
      console.warn('[DisplayController] Failed to load config:', err);
    }
    // デフォルト設定
    return {
      wsUrl: '',
      sseUrl: '',
      brightnessMode: 'auto',
      alertThresholdWatts: DEFAULT_ALERT_THRESHOLD,
    };
  }

  /**
   * 設定を更新
   */
  updateConfig(config: Partial<DisplayConfig>): void {
    if (config.wsUrl !== undefined) {
      this.messageClient.wsUrl = config.wsUrl;
    }
    if (config.sseUrl !== undefined) {
      this.sseClient.sseUrl = config.sseUrl;
      // SSE URL が設定されたら接続開始
      if (config.sseUrl && this._state.initialized) {
        this.sseClient.connect();
      }
    }
    if (config.brightnessMode !== undefined) {
      this._state.brightnessMode = config.brightnessMode;
      this.applyBrightness(this._state.ambientLevel);
    }
    if (config.alertThresholdWatts !== undefined) {
      this.alertThresholdWatts = config.alertThresholdWatts;
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
        this.applyTimeBasedBrightness();
      }
    } else {
      this.applyBrightness(this._state.brightnessMode === 'light' ? 1 : 0);
    }

    // 4. WebSocket 接続を開始（設定されていれば）
    if (this.messageClient.wsUrl) {
      this.messageClient.connect();
    }

    // 5. SSE 接続を開始（設定されていれば）
    if (this.sseClient.sseUrl) {
      this.sseClient.connect();
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
    const level = (hour >= 6 && hour < 18) ? 0.7 : 0.2;
    this._state.ambientLevel = level;
    this.applyBrightness(level);
    this.notifyStateChange();

    setInterval(() => {
      if (this._state.brightnessMode === 'auto' && !this._state.cameraAvailable) {
        this.applyTimeBasedBrightness();
      }
    }, 3600000);
  }

  /**
   * 電力データを処理
   */
  private handlePowerReading(event: PowerReadingEvent): void {
    console.log('[DisplayController] Power reading:', event.watts, 'W');

    const previousPower = this._state.currentPower;
    this._state.currentPower = event;

    // 閾値チェック: 超えた瞬間にアラート音
    if (event.watts >= this.alertThresholdWatts) {
      // 前回が閾値未満、または初回の場合のみ音を鳴らす
      if (!previousPower || previousPower.watts < this.alertThresholdWatts) {
        this.soundManager.play('alert');
      }
    }

    this.notifyStateChange();
  }

  /**
   * WebSocket メッセージを処理
   */
  private handleMessage(message: DisplayMessage): void {
    console.log('[DisplayController] Handling message:', message);

    if (this.messageTimeoutId) {
      clearTimeout(this.messageTimeoutId);
      this.messageTimeoutId = null;
    }

    if (message.type === 'clear') {
      this._state.currentMessage = null;
      this.notifyStateChange();
      return;
    }

    if (message.type === 'config') {
      return;
    }

    this._state.currentMessage = message;

    if (message.sound && message.sound !== 'none') {
      this.soundManager.play(message.sound);
    }

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
    this.sseClient.disconnect();
    if (this.messageTimeoutId) {
      clearTimeout(this.messageTimeoutId);
    }
  }
}
