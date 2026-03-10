/**
 * Notionページ自動整理スクリプト
 * 末尾の未整理ブロック（plain paragraphが連続する部分）を検出し、
 * キーワードルールに基づいて各セクションへ自動分類する。
 *
 * 使用方法:
 *   node scripts/auto_organize.js [--dry-run]
 *
 * --dry-run: 実際には変更せず、分類結果のみ表示する
 *
 * 自動実行 (Windowsタスクスケジューラ):
 *   schtasks /create /tn "NotionAutoOrganize" /tr "node C:\path\to\scripts\auto_organize.js" /sc weekly /d MON /st 09:00
 */

'use strict';

const https = require('https');
const path = require('path');
const fs = require('fs');

// .env 読み込み
const envPath = path.join(__dirname, '../config/.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return;
    const k = line.slice(0, eqIdx).trim();
    const v = line.slice(eqIdx + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  });
}

const API_KEY = process.env.NOTION_API_KEY;
const PAGE_ID = process.env.NOTION_PAGE_ID;
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_KEY || !PAGE_ID) {
  console.error('NOTION_API_KEY / NOTION_PAGE_ID が未設定です。config/.env を確認してください。');
  process.exit(1);
}

if (DRY_RUN) console.log('[DRY RUN モード] 実際の変更は行いません。\n');

// ========== Notion API ==========

function apiRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.notion.com',
      path: apiPath,
      method,
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(opts, r => {
      let buf = '';
      r.on('data', c => buf += c);
      r.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch { resolve(buf); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const notionGet = p => apiRequest('GET', p, null);
const notionPatch = (p, b) => apiRequest('PATCH', p, b);
const notionDelete = p => apiRequest('DELETE', p, null);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchAllBlocks() {
  const all = [];
  let cursor;
  do {
    let p = `/v1/blocks/${PAGE_ID}/children?page_size=100`;
    if (cursor) p += '&start_cursor=' + cursor;
    const resp = await notionGet(p);
    if (resp.object === 'error') throw new Error(resp.message);
    all.push(...resp.results);
    cursor = resp.has_more ? resp.next_cursor : null;
  } while (cursor);
  return all;
}

// ========== ブロック型ヘルパー ==========

const richText = (text, bold = false) => [{
  type: 'text',
  text: { content: text },
  annotations: { bold, italic: false, strikethrough: false, underline: false, code: false, color: 'default' }
}];

const mkH3 = text => ({ object: 'block', type: 'heading_3', heading_3: { rich_text: richText(text) } });
const mkParagraph = (text, bold = false) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: richText(text, bold) } });
const mkBullet = text => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText(text) } });

// ========== セクション解析 ==========

function getText(block) {
  const t = block.type;
  const bd = block[t] || {};
  return (bd.rich_text || []).map(r => r.plain_text).join('');
}

function getSections(blocks) {
  const sections = {};
  let currentSection = null;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const t = b.type;
    const text = getText(b);
    if (t === 'heading_2') {
      currentSection = text;
      sections[text] = { headingId: b.id, lastId: b.id, lastIdx: i };
    } else if (t === 'divider') {
      currentSection = null;
    } else if (currentSection) {
      if (t !== 'paragraph' || text.trim()) {
        sections[currentSection].lastId = b.id;
        sections[currentSection].lastIdx = i;
      }
    }
  }
  return sections;
}

// ========== 未整理ゾーン検出 ==========

/**
 * 末尾から遡って「セクションに属さない plain paragraph の連続」を検出する。
 * 最後の divider の後に H2 があり、その後に H3/bullet/etc がある部分を「整理済み」と判断。
 * その後ろに続く plain paragraphs だけの部分を「未整理ゾーン」とする。
 */
function findUnorganizedZone(blocks) {
  // 最後の H2 の位置を探す
  let lastH2Idx = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].type === 'heading_2') { lastH2Idx = i; break; }
  }
  if (lastH2Idx === -1) return blocks.length; // H2 がなければ全部未整理

  // 最後の H2 以降で、H3 や bullet などの「構造ブロック」が最後にある位置を探す
  let lastStructuredIdx = lastH2Idx;
  for (let i = lastH2Idx + 1; i < blocks.length; i++) {
    const t = blocks[i].type;
    const text = getText(blocks[i]).trim();
    if (t === 'heading_3' || t === 'bulleted_list_item' || t === 'numbered_list_item' || t === 'toggle') {
      lastStructuredIdx = i;
    } else if (t === 'paragraph' && text && text.length > 2) {
      // 構造っぽい paragraph（例: "住所: ..." "電話番号: ..." など）
      if (/[:：]/.test(text) || text.startsWith('http')) {
        lastStructuredIdx = i;
      }
    }
  }

  // lastStructuredIdx の次から未整理ゾーン開始
  return lastStructuredIdx + 1;
}

// ========== 分類ルール ==========

const SECTION_RULES = [
  {
    section: '💻 開発・API関連',
    keywords: ['github', 'gitlab', 'aws', 'gcp', 'google cloud', 'heroku', 'vercel', 'netlify',
      'api', 'token', 'ssh', 'termius', 'docker', 'cloudflare', 'firebase', 'supabase',
      'openai', 'anthropic', 'claude', 'hugging face', 'hf_', 'vscode', 'jetbrains', 'npm'],
  },
  {
    section: '📧 メールアカウント',
    keywords: ['gmail', 'outlook', 'yahoo mail', 'icloud', 'proton', 'メール', 'mail'],
  },
  {
    section: '🏦 金融サービス',
    keywords: ['銀行', 'bank', 'カード', 'card', 'paypal', 'stripe', 'paypay', '楽天pay',
      '口座', '暗証番号', 'atm', 'ネットバンク', 'moneyforward', '家計簿', 'クレジット'],
  },
  {
    section: '📱 デバイス・SIM・通信',
    keywords: ['wifi', 'wi-fi', 'ssid', 'ルーター', 'router', 'sim', 'ahamo', '楽天モバイル',
      'softbank', 'docomo', 'au', 'mvno', 'テザリング', 'iphone', 'android', 'ipad',
      'pc', 'mac', 'bluetooth', 'archer', 'tp-link', 'buffalo', 'elecom'],
  },
  {
    section: '🎮 エンタメ・趣味',
    keywords: ['netflix', 'youtube', 'spotify', 'amazon prime', 'disney', 'hulu', 'dazn',
      'steam', 'playstation', 'nintendo', 'xbox', 'game', 'ゲーム', 'anime', 'アニメ',
      'twitter', 'x.com', 'instagram', 'tiktok', 'discord'],
  },
  {
    section: '🎓 学習・教育サービス',
    keywords: ['udemy', 'coursera', 'duolingo', 'atcoder', 'leetcode', 'qiita', 'zenn',
      'hsk', 'toeic', 'toefl', '英検', '語学', '学習', '教育', 'paiza', 'progate'],
  },
  {
    section: '🏫 大学・学校関連',
    keywords: ['大学', '学校', '学籍', '学生', '共立', '東京理科', '理科大', 'manaba',
      'campus', 'portal', '授業', '履修', '成績', 'kyoikusha'],
  },
  {
    section: '🏢 仕事・バイト関連',
    keywords: ['confluence', 'jira', 'slack', 'teams', 'zoom', 'notion', 'asana', 'trello',
      'salesforce', 'freee', 'マネーフォワード', '仕事', 'バイト', '会社', '社員',
      'king of time', 'kingofime', 'eset', '神楽坂', 'kagurazaka', 'ディバータ', 'diverta',
      'tmori@', 'work', 'office'],
  },
  {
    section: '🔐 重要な認証情報',
    keywords: ['免許', 'マイナンバー', 'パスポート', 'passport', '保険証', '年金',
      '暗証番号', 'pin', '住民票', 'マイナポータル'],
  },
  {
    section: '🔑 パスワード管理・セキュリティツール',
    keywords: ['1password', 'bitwarden', 'lastpass', 'keepass', 'dashlane', 'keychain',
      'authy', 'google authenticator', '2fa', 'totp', 'セキュリティ', 'vpn',
      'eset', 'norton', 'kaspersky', 'malwarebytes'],
  },
  {
    section: '🏠 生活サービス',
    keywords: ['amazon', 'rakuten', '楽天', 'yahoo', 'メルカリ', 'paypay mall',
      '電気', 'ガス', '水道', '電話', 'ntt', 'nhk', '保険', 'クーポン',
      'ドミトリ', 'ドーミー', 'suumo', 'at home', '不動産'],
  },
  {
    section: '🛍️ ショッピング・サービス',
    keywords: ['amazon', 'rakuten', '楽天市場', 'yahoo shopping', 'zozotown', 'qoo10',
      'aliexpress', 'ebay', 'etsy', 'realforce', 'hhkb', 'apple store'],
  },
  {
    section: '👨‍👩‍👧 家族連絡先・住所',
    keywords: ['家族', '父', '母', '祖父', '祖母', '実家', '連絡先', '住所',
      '川口', '名古屋', 'コミュニティ', 'かつしか', '葛飾'],
  },
];

function classifyText(text) {
  const lower = text.toLowerCase();
  for (const rule of SECTION_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) return rule.section;
    }
  }
  return null; // 分類不能
}

// ========== グループ化 ==========

/**
 * 未整理ブロックを空行で区切ったグループに分割する。
 * 各グループは { lines: string[], ids: string[] } 形式。
 */
function groupBlocks(blocks) {
  const groups = [];
  let current = { lines: [], ids: [] };

  for (const b of blocks) {
    const text = getText(b).trim();
    if (!text) {
      if (current.lines.length > 0) {
        groups.push(current);
        current = { lines: [], ids: [] };
      }
    } else {
      current.lines.push(text);
      current.ids.push(b.id);
    }
  }
  if (current.lines.length > 0) groups.push(current);
  return groups;
}

/**
 * グループを Notion ブロック配列に変換する。
 * 1行目を H3 または太字 paragraph、残りを bullet に。
 */
function groupToBlocks(group) {
  const [title, ...rest] = group.lines;
  const result = [mkH3(title)];
  for (const line of rest) {
    // "key: value" 形式は bullet、それ以外も bullet
    result.push(mkBullet(line));
  }
  return result;
}

// ========== メイン処理 ==========

async function insertAfter(afterId, children) {
  if (DRY_RUN) {
    console.log(`  [DRY] insertAfter(${afterId.substr(0, 8)}.., ${children.length} blocks)`);
    return;
  }
  const result = await notionPatch(`/v1/blocks/${PAGE_ID}/children`, { children, after: afterId });
  if (result.object === 'error') console.error('  Insert error:', result.message);
}

async function deleteBlocks(ids) {
  if (DRY_RUN) {
    console.log(`  [DRY] delete ${ids.length} blocks`);
    return;
  }
  for (const id of ids) {
    await notionDelete(`/v1/blocks/${id}`);
    await sleep(150);
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] Notion自動整理を開始します...`);
  console.log('ブロック取得中...');

  const blocks = await fetchAllBlocks();
  console.log(`総ブロック数: ${blocks.length}`);

  const unorgStart = findUnorganizedZone(blocks);
  const unorganized = blocks.slice(unorgStart);

  if (unorganized.length === 0) {
    console.log('✅ 未整理ブロックはありません。');
    return;
  }

  console.log(`未整理ゾーン: [${unorgStart}]〜[${blocks.length - 1}] (${unorganized.length}ブロック)`);

  // セクション最終ブロックIDを取得
  const organizedPart = blocks.slice(0, unorgStart);
  const sections = getSections(organizedPart);

  // グループ化
  const groups = groupBlocks(unorganized);
  console.log(`グループ数: ${groups.length}`);

  // 分類
  const classified = {};
  const unclassified = [];

  for (const group of groups) {
    const fullText = group.lines.join(' ');
    const section = classifyText(fullText);
    if (section) {
      if (!classified[section]) classified[section] = [];
      classified[section].push(group);
    } else {
      unclassified.push(group);
    }
  }

  console.log('\n=== 分類結果 ===');
  for (const [sec, grps] of Object.entries(classified)) {
    console.log(`${sec}: ${grps.length}グループ`);
    grps.forEach(g => console.log(`  - ${g.lines[0]}`));
  }
  if (unclassified.length > 0) {
    console.log(`\n⚠️ 分類不能: ${unclassified.length}グループ`);
    unclassified.forEach(g => console.log(`  - ${g.lines.join(' | ')}`));
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] 上記の変更を実際に適用するには --dry-run を外して実行してください。');
    return;
  }

  // 各セクションへ挿入
  for (const [sectionName, grps] of Object.entries(classified)) {
    const sec = sections[sectionName];
    if (!sec) {
      console.warn(`⚠️ セクション "${sectionName}" が見つかりません。スキップ。`);
      continue;
    }
    const newBlocks = grps.flatMap(g => groupToBlocks(g));
    console.log(`\n${sectionName} に ${newBlocks.length}ブロック挿入中...`);
    await insertAfter(sec.lastId, newBlocks);
    await sleep(600);
  }

  // 全ての未整理ブロックを削除（分類不能含む）
  const allDeleteIds = unorganized.map(b => b.id);
  console.log(`\n未整理ブロック ${allDeleteIds.length}件 を削除中...`);
  await deleteBlocks(allDeleteIds);

  console.log(`\n✅ 自動整理完了。(分類: ${groups.length - unclassified.length}グループ, 未分類: ${unclassified.length}グループ)`);

  // ログ出力
  const logPath = path.join(__dirname, '../outputs/auto_organize_log.jsonl');
  const logEntry = {
    timestamp: new Date().toISOString(),
    totalBlocks: blocks.length,
    unorganizedCount: unorganized.length,
    classifiedGroups: groups.length - unclassified.length,
    unclassifiedGroups: unclassified.length,
    sections: Object.fromEntries(Object.entries(classified).map(([k, v]) => [k, v.length])),
  };
  fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n', 'utf8');
}

main().catch(err => {
  console.error('エラー:', err.message);
  process.exit(1);
});
