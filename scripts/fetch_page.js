const https = require('https');
const fs = require('fs');

// 認証情報は config/.env から読み込み
const path = require('path');
const envPath = path.join(__dirname, '../config/.env');
if (require('fs').existsSync(envPath)) {
  require('fs').readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
  });
}
const API_KEY = process.env.NOTION_API_KEY;
const PAGE_ID = process.env.NOTION_PAGE_ID || '1de4ac1d-3f0a-4e90-95f2-3c4249fe30dc';
if (!API_KEY) { console.error('NOTION_API_KEY が設定されていません'); process.exit(1); }

function get(path) {
  return new Promise((res, rej) => {
    const opts = {
      hostname: 'api.notion.com',
      path,
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'Notion-Version': '2022-06-28'
      }
    };
    https.get(opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

function extractText(block) {
  const t = block.type;
  const data = block[t];
  if (!data || !data.rich_text) return { type: t, text: '' };
  const text = data.rich_text.map(r => r.plain_text).join('');
  return { type: t, text, id: block.id };
}

async function getAllBlocks(id, indent) {
  indent = indent || 0;
  let results = [];
  let cursor;
  do {
    let path = '/v1/blocks/' + id + '/children?page_size=100';
    if (cursor) path += '&start_cursor=' + cursor;
    const resp = await get(path);
    for (const b of resp.results) {
      const e = extractText(b);
      const prefix = '  '.repeat(indent);
      if (e.type === 'divider') results.push(prefix + '---');
      else if (e.type === 'heading_1') results.push(prefix + '# ' + e.text);
      else if (e.type === 'heading_2') results.push(prefix + '## ' + e.text);
      else if (e.type === 'heading_3') results.push(prefix + '### ' + e.text);
      else if (e.type === 'bulleted_list_item') results.push(prefix + '- ' + e.text);
      else if (e.type === 'numbered_list_item') results.push(prefix + '1. ' + e.text);
      else if (e.type === 'to_do') {
        const checked = b.to_do && b.to_do.checked ? '[x]' : '[ ]';
        results.push(prefix + '- ' + checked + ' ' + e.text);
      }
      else if (e.type === 'quote') results.push(prefix + '> ' + e.text);
      else if (e.type === 'callout') results.push(prefix + '> [callout] ' + e.text);
      else if (e.type === 'toggle') results.push(prefix + '▶ ' + e.text);
      else if (e.type === 'code') results.push(prefix + '```\n' + e.text + '\n```');
      else if (e.text) results.push(prefix + e.text);
      else results.push(prefix + '[' + e.type + ']');
      if (b.has_children) {
        const children = await getAllBlocks(b.id, indent + 1);
        results = results.concat(children);
      }
    }
    cursor = resp.has_more ? resp.next_cursor : null;
  } while (cursor);
  return results;
}

getAllBlocks(PAGE_ID).then(lines => {
  const output = lines.join('\n');
  fs.writeFileSync('page_content.txt', output, 'utf8');
  console.log(output);
}).catch(console.error);
