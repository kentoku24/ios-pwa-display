/**
 * Message Client - WebSocket でメッセージを受信する
 * 
 * 自動再接続、visibilitychange 対応、接続状態の通知を含む。
 */

export interface DisplayMessage {
  type: 'text' | 'image' | 'alert' | 'clear' | 'config';
  content?: string;
  imageUrl?: string;
  title?: string;
  body?: string;
  style?: {
    backgroundColor?: string;
    textColor?: string;
    fontSize?: 'small' | 'medium' | 'large' | 'xlarge';
    animation?: 'none' | 'fade' | 'slide' | 'pulse';
  };
  sound?: 'none' | 'default' | 'alert' | 'chime';
  duration?: number;
  priority?: 'low' | 'normal' | 'high';
}

export type ConnectionState = 'connected' | 'connecting' | 'disconnected';
export type MessageHandler = (message: DisplayMessage) => void;
export type ConnectionHandler = (state: ConnectionState) => void;

export class MessageClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private reconnectTimeoutId: number | null = null;
  private messageHandlers = new Set<MessageHandler>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private _state: ConnectionState = 'disconnected';
  private _wsUrl: string;
  private shouldConnect = false;

  constructor(wsUrl: string) {
    this._wsUrl = wsUrl;

    // ページが表示されたら再接続を試みる
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.shouldConnect) {
        if (this._state === 'disconnected') {
          console.log('[MessageClient] Page visible, reconnecting...');
          this.connect();
        }
      }
    });
  }

  get state(): ConnectionState {
    return this._state;
  }

  get wsUrl(): string {
    return this._wsUrl;
  }

  set wsUrl(url: string) {
    const wasConnected = this.shouldConnect;
    this.disconnect();
    this._wsUrl = url;
    if (wasConnected) {
      this.connect();
    }
  }

  private setState(state: ConnectionState): void {
    if (this._state !== state) {
      this._state = state;
      this.connectionHandlers.forEach(h => h(state));
    }
  }

  /**
   * WebSocket 接続を開始
   */
  connect(): void {
    if (!this._wsUrl) {
      console.warn('[MessageClient] No WebSocket URL configured');
      return;
    }

    this.shouldConnect = true;

    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.setState('connecting');

    try {
      this.ws = new WebSocket(this._wsUrl);

      this.ws.onopen = () => {
        console.log('[MessageClient] Connected');
        this.reconnectAttempts = 0;
        this.setState('connected');

        // サーバーに接続通知
        this.send({ type: 'hello', client: 'ios-pwa-display' });
      };

      this.ws.onmessage = (event) => {
        try {
          const message: DisplayMessage = JSON.parse(event.data);
          console.log('[MessageClient] Received:', message);
          this.messageHandlers.forEach(h => h(message));
        } catch (err) {
          console.error('[MessageClient] Invalid message:', err);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[MessageClient] Disconnected:', event.code, event.reason);
        this.setState('disconnected');
        
        if (this.shouldConnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.error('[MessageClient] Error:', err);
      };
    } catch (err) {
      console.error('[MessageClient] Failed to create WebSocket:', err);
      this.setState('disconnected');
      this.scheduleReconnect();
    }
  }

  /**
   * 再接続をスケジュール（指数バックオフ）
   */
  private scheduleReconnect(): void {
    if (!this.shouldConnect) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[MessageClient] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 30000);
    console.log(`[MessageClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimeoutId = window.setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  /**
   * サーバーにメッセージを送信
   */
  send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /**
   * メッセージ受信ハンドラを登録
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * 接続状態変更ハンドラを登録
   */
  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    // 現在の状態を即座に通知
    handler(this._state);
    return () => this.connectionHandlers.delete(handler);
  }

  /**
   * 接続を切断
   */
  disconnect(): void {
    this.shouldConnect = false;
    
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState('disconnected');
  }
}
