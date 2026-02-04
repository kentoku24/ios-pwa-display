/**
 * Brightness Detector - カメラ映像から周囲の明るさを推定する
 * 
 * フロントカメラの映像を低解像度でサンプリングし、
 * 平均輝度を算出することで環境光を推定する。
 */

export interface BrightnessConfig {
  /** サンプリング間隔 (ms) */
  sampleIntervalMs: number;
  /** 解像度（低いほど軽量） */
  resolution: number;
  /** 移動平均のウィンドウサイズ */
  smoothingWindow: number;
}

export type BrightnessCallback = (level: number) => void;

export class BrightnessDetector {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stream: MediaStream | null = null;
  private intervalId: number | null = null;
  private history: number[] = [];
  private _available = false;
  private _currentLevel = 0.5;

  constructor(private config: BrightnessConfig = {
    sampleIntervalMs: 3000,
    resolution: 32,
    smoothingWindow: 5,
  }) {
    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', ''); // iOS必須
    this.video.setAttribute('autoplay', '');
    this.video.muted = true;
    this.video.style.position = 'fixed';
    this.video.style.top = '-9999px';
    this.video.style.left = '-9999px';
    this.video.style.width = '1px';
    this.video.style.height = '1px';
    this.video.style.opacity = '0.01';
    document.body.appendChild(this.video);

    this.canvas = document.createElement('canvas');
    this.canvas.width = config.resolution;
    this.canvas.height = config.resolution;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  get available(): boolean {
    return this._available;
  }

  get currentLevel(): number {
    return this._currentLevel;
  }

  /**
   * カメラを起動して明るさ検出を開始
   */
  async start(onBrightness: BrightnessCallback): Promise<boolean> {
    try {
      // カメラへのアクセスを要求
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: this.config.resolution },
          height: { ideal: this.config.resolution },
        },
        audio: false,
      });

      this.video.srcObject = this.stream;
      await this.video.play();
      this._available = true;

      console.log('[BrightnessDetector] Camera started');

      // 定期的にサンプリング
      this.intervalId = window.setInterval(() => {
        const brightness = this.measureBrightness();
        this._currentLevel = brightness;
        onBrightness(brightness);
      }, this.config.sampleIntervalMs);

      // 初回測定
      setTimeout(() => {
        const brightness = this.measureBrightness();
        this._currentLevel = brightness;
        onBrightness(brightness);
      }, 500);

      return true;
    } catch (err) {
      console.warn('[BrightnessDetector] Camera not available:', err);
      this._available = false;
      return false;
    }
  }

  /**
   * 現在のフレームから明るさを測定
   * @returns 0.0 (暗い) ~ 1.0 (明るい)
   */
  private measureBrightness(): number {
    const { resolution } = this.config;
    
    // 映像をCanvasに描画
    this.ctx.drawImage(this.video, 0, 0, resolution, resolution);
    const imageData = this.ctx.getImageData(0, 0, resolution, resolution);
    const data = imageData.data;

    // 全ピクセルの輝度を計算
    let totalLuminance = 0;
    const pixelCount = resolution * resolution;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // ITU-R BT.709 相対輝度
      totalLuminance += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    const avgLuminance = totalLuminance / pixelCount / 255;

    // 移動平均でスムージング
    this.history.push(avgLuminance);
    if (this.history.length > this.config.smoothingWindow) {
      this.history.shift();
    }

    const smoothed = this.history.reduce((a, b) => a + b, 0) / this.history.length;

    return Math.max(0, Math.min(1, smoothed));
  }

  /**
   * 検出を停止してカメラを解放
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    this._available = false;
    console.log('[BrightnessDetector] Stopped');
  }
}
