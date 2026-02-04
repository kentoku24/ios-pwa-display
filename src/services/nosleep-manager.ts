/**
 * NoSleep Manager - iOS Safari でスリープを防止する
 * 
 * 内部的に非表示の動画をループ再生することでスリープを防ぐ。
 * enable() はユーザージェスチャー内で呼ぶ必要がある。
 */
import NoSleep from 'nosleep.js';

export class NoSleepManager {
  private noSleep: NoSleep;
  private _enabled = false;

  constructor() {
    this.noSleep = new NoSleep();
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * スリープ防止を有効化
   * 必ずユーザージェスチャー（tap/click）のイベントハンドラ内で呼ぶこと
   */
  async enable(): Promise<void> {
    if (this._enabled) return;
    
    try {
      await this.noSleep.enable();
      this._enabled = true;
      console.log('[NoSleep] Enabled');
    } catch (err) {
      console.error('[NoSleep] Failed to enable:', err);
      throw err;
    }
  }

  /**
   * スリープ防止を無効化
   */
  disable(): void {
    if (!this._enabled) return;
    
    this.noSleep.disable();
    this._enabled = false;
    console.log('[NoSleep] Disabled');
  }
}
