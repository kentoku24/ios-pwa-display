# iOS PWA Display

iOS Safari 上でPWAとして動作する常時表示ディスプレイアプリ。

## 機能

- **自動スリープ禁止** — NoSleep.js で画面が消えないように
- **周囲明るさ推定** — フロントカメラで環境光を検出、画面の明るさ/配色を自動調整
- **WebSocket メッセージ受信** — サーバーからのメッセージで画面表示を変更
- **音声通知** — メッセージ受信時にサウンド再生

## セットアップ

```bash
# 依存関係インストール
npm install

# 開発サーバー起動（フロントエンド）
npm run dev

# WebSocket サーバー起動（別ターミナル）
npm run server
```

## 使い方

### 1. フロントエンドにアクセス

```
http://localhost:3000
```

### 2. WebSocket URL を設定

画面長押し（またはPC右クリック）で設定パネルを開き、WebSocket URL を入力:

```
ws://localhost:8080
```

### 3. メッセージを送信

```bash
# テキストメッセージ
curl -X POST http://localhost:8080/send \
  -H "Content-Type: application/json" \
  -d '{"type":"text","content":"Hello!","sound":"default"}'

# アラート
curl -X POST http://localhost:8080/send \
  -H "Content-Type: application/json" \
  -d '{"type":"alert","title":"警告","body":"これはアラートです","sound":"alert"}'

# 画面クリア
curl -X POST http://localhost:8080/send \
  -H "Content-Type: application/json" \
  -d '{"type":"clear"}'
```

### 4. サーバー Web UI

ブラウザで `http://localhost:8080` を開くと、簡易送信UIが使える。

## メッセージ形式

```typescript
interface DisplayMessage {
  type: 'text' | 'image' | 'alert' | 'clear';
  content?: string;        // type: text
  imageUrl?: string;       // type: image
  title?: string;          // type: alert
  body?: string;           // type: alert
  style?: {
    backgroundColor?: string;
    textColor?: string;
    fontSize?: 'small' | 'medium' | 'large' | 'xlarge';
  };
  sound?: 'none' | 'default' | 'alert' | 'chime';
  duration?: number;       // ms, 0 = 永続
}
```

## iOS でPWAとしてインストール

1. Safari で開く
2. 共有ボタン → 「ホーム画面に追加」
3. ホーム画面から起動するとフルスクリーンで動作

## 本番デプロイ

### HTTPS が必要

カメラアクセスには HTTPS が必要。以下のいずれかを使用:

- **ngrok**: `ngrok http 3000`
- **Cloudflare Tunnel**
- **Let's Encrypt** + リバースプロキシ

### ビルド

```bash
npm run build
# dist/ にビルド結果が出力される
```

## ディレクトリ構成

```
ios-pwa-display/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
├── src/
│   ├── main.ts
│   ├── controllers/
│   │   └── display-controller.ts
│   ├── services/
│   │   ├── nosleep-manager.ts
│   │   ├── brightness-detector.ts
│   │   ├── message-client.ts
│   │   └── sound-manager.ts
│   └── styles/
│       └── main.css
└── server/
    └── index.ts
```

## 制約

- **ユーザージェスチャー必須**: スリープ防止・カメラ・音声は初回タップ後に有効化
- **バックグラウンド不可**: WebSocket はバックグラウンドで切断される（フォアグラウンド専用）
- **HTTPS必須**: カメラアクセスには HTTPS が必要（localhost は例外）

