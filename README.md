# Notion-Management

Notion ページを自動整理するためのスクリプト集。
個人情報ページの末尾に溜まった未整理メモを、毎週自動で各セクションへ分類・移動する。

## 何をするリポジトリか

Notion の個人情報ページに雑にメモを追記しておくと、GitHub Actions が週次で自動整理してくれる。

```
末尾に雑に書く               自動で各セクションへ移動
─────────────────────        ──────────────────────────────
Netflix                  →   🎮 エンタメ・趣味
example@gmail.com
password123

SomeWorkTool             →   🏢 仕事・バイト関連
ID: xxxxxxxxxxxx
password456
```

## セットアップ

### 1. Secrets を登録（GitHub リポジトリ Settings → Secrets）

| Secret 名 | 内容 |
|---|---|
| `NOTION_API_KEY` | Notion Integration のトークン |
| `NOTION_PAGE_ID` | 整理対象ページの ID |

### 2. 完了

毎週月曜 09:00 JST に自動実行される。

## 手動実行

**GitHub Actions から（ブラウザ）**
Actions タブ → "Notion Auto Organize" → "Run workflow"

**ローカルから**
```bash
# config/.env に NOTION_API_KEY と NOTION_PAGE_ID を設定してから
node scripts/auto_organize.js --dry-run  # 確認のみ
node scripts/auto_organize.js            # 実行
```

## スクリプト

| ファイル | 用途 |
|---|---|
| `scripts/auto_organize.js` | 末尾の未整理ブロックを自動分類・整理（メイン） |
| `scripts/fetch_page.js` | ページ内容を Markdown で取得 |
| `scripts/organize_notion_page.js` | 未整理ゾーンを一括移動（手動用） |
| `scripts/.mcp.json` | Notion MCP サーバー設定 |

## 分類ルール

`auto_organize.js` 内の `SECTION_RULES` でキーワードとセクションのマッピングを定義。
未分類のグループはスキップされるので、ページから消えることはない。
