# Notion API スクリプト集

このディレクトリには、Notion APIを使用するための再利用可能なスクリプトが含まれています。

## 📋 スクリプト一覧

#### `fetch_page.js`
- **用途**: Notionページの内容を取得して Markdown として出力
- **使用方法**: `node scripts/fetch_page.js`

#### `organize_page.js`
- **用途**: Notionページの特定の未整理ブロックをセクション別に移動（一回実行済み）
- **使用方法**: `node scripts/organize_page.js`

#### `organize_notion_page.js`
- **用途**: 個人情報ページの未整理ゾーンを各セクションへ一括移動
- **使用方法**: `node scripts/organize_notion_page.js`

#### `auto_organize.js` ⭐ メイン自動整理スクリプト
- **用途**: ページ末尾の未整理ブロックをキーワードルールで自動分類・整理
- **使用方法**:
  ```bash
  node scripts/auto_organize.js --dry-run  # 確認のみ
  node scripts/auto_organize.js            # 実際に実行
  ```
- **自動実行設定**: `scripts/setup_scheduler.ps1` を参照

#### `organize_directory.js`
- **用途**: ディレクトリ構造の整理
- **使用方法**: `node scripts/organize_directory.js`

#### `setup_scheduler.ps1`
- **用途**: Windowsタスクスケジューラに自動整理タスクを登録（毎週月曜 09:00）
- **使用方法**: PowerShell (管理者) で `.\scripts\setup_scheduler.ps1`

## 🔧 共通設定

`config/.env` に以下を設定してください：

```
NOTION_API_KEY=<your-notion-integration-token>
NOTION_PAGE_ID=<your-page-id>
```

各スクリプトは起動時に `config/.env` を自動読み込みします。

## 📝 削除したスクリプト

以下のスクリプトは特定の用途で使用され、完了したため削除しました：

- `organize_final.js` - 特定の整理タスク（完了済み）
- `fetch_details.js` - 特定のページIDにハードコード（再利用性低い）
- `fetch_two.js` - 特定のページIDにハードコード（再利用性低い）
- `update_both.js` - 特定のページIDにハードコード（再利用性低い）

## 🚀 新しいスクリプトの作成

新しいスクリプトを作成する際は、以下のパターンを使用してください：

```javascript
const https = require('https');

const API_KEY = process.env.NOTION_API_KEY;
const PAGE_ID = process.env.NOTION_PAGE_ID;

function request(method, path, body) {
  // 共通のリクエスト関数
}

// スクリプト固有の処理
```

## ⚠️ 注意事項

- APIキーは機密情報です。Gitにコミットしないでください
- スクリプト実行前に、対象のページIDを確認してください
- 大量のブロックを操作する場合は、レート制限に注意してください
