const fs = require('fs');
const path = require('path');

const baseDir = __dirname;

// ディレクトリ構造の定義
const structure = {
  'scripts': {
    description: 'スクリプトファイル（.js, .py）',
    files: [
      'organize_final.js',
      'organize_page.js',
      'fetch_details.js',
      'fetch_two.js',
      'fetch_page.js',
      'update_both.js',
      'convert_keep_to_csv.py',
      'extract_personal_info.py',
      'notion_task_durations.py',
      'split_csv.py'
    ]
  },
  'data': {
    description: 'データファイル',
    subdirs: {
      'csv': {
        description: 'CSVファイル',
        files: [
          'google_keep_all_notes.csv',
          'google_keep_notes_part1.csv',
          'google_keep_notes_part2.csv'
        ]
      },
      'exports': {
        description: 'エクスポートデータ',
        dirs: [
          'takeout-20260101T075826Z-3-001',
          '1f0311cb-fb02-4935-bc58-a486b46d36ac_Export-d42fb327-4054-4d6a-bfdc-0364e256d4c5'
        ],
        files: [
          'takeout-20260101T075826Z-3-001.zip',
          '1f0311cb-fb02-4935-bc58-a486b46d36ac_Export-d42fb327-4054-4d6a-bfdc-0364e256d4c5.zip'
        ]
      },
      'temp': {
        description: '一時ファイル',
        files: [
          'page_content.txt'
        ]
      }
    }
  },
  'organized': {
    description: '整理済みファイル',
    dirs: [
      'organaizing_keep_memo'
    ]
  },
  'config': {
    description: '設定ファイル',
    files: [
      '.env',
      '.mcp.json'
    ]
  },
  'outputs': {
    description: '出力ファイル（既存）',
    keep: true // 既存のディレクトリをそのまま保持
  }
};

// ディレクトリを作成
function createDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

// ファイルを移動
function moveFile(src, dest) {
  if (fs.existsSync(src)) {
    const destDir = path.dirname(dest);
    createDir(destDir);
    
    if (fs.existsSync(dest)) {
      console.log(`Warning: ${dest} already exists. Skipping.`);
      return false;
    }
    
    fs.renameSync(src, dest);
    console.log(`Moved: ${src} -> ${dest}`);
    return true;
  } else {
    console.log(`Warning: ${src} does not exist. Skipping.`);
    return false;
  }
}

// ディレクトリを移動
function moveDir(src, dest) {
  if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
    const destParent = path.dirname(dest);
    createDir(destParent);
    
    if (fs.existsSync(dest)) {
      console.log(`Warning: ${dest} already exists. Skipping.`);
      return false;
    }
    
    fs.renameSync(src, dest);
    console.log(`Moved directory: ${src} -> ${dest}`);
    return true;
  } else {
    console.log(`Warning: ${src} does not exist or is not a directory. Skipping.`);
    return false;
  }
}

// 構造を再帰的に処理
function processStructure(structure, basePath = baseDir) {
  for (const [name, config] of Object.entries(structure)) {
    const targetPath = path.join(basePath, name);
    
    if (config.keep) {
      // 既存のディレクトリをそのまま保持
      createDir(targetPath);
      continue;
    }
    
    createDir(targetPath);
    
    // ファイルを移動
    if (config.files) {
      for (const file of config.files) {
        const src = path.join(baseDir, file);
        const dest = path.join(targetPath, file);
        moveFile(src, dest);
      }
    }
    
    // ディレクトリを移動
    if (config.dirs) {
      for (const dir of config.dirs) {
        const src = path.join(baseDir, dir);
        const dest = path.join(targetPath, dir);
        moveDir(src, dest);
      }
    }
    
    // サブディレクトリを処理
    if (config.subdirs) {
      processStructure(config.subdirs, targetPath);
    }
  }
}

// 不要なディレクトリを削除
function cleanupUnwantedDirs() {
  const unwantedDirs = ['%USERP~1'];
  
  for (const dir of unwantedDirs) {
    const dirPath = path.join(baseDir, dir);
    if (fs.existsSync(dirPath)) {
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`Removed unwanted directory: ${dir}`);
      } catch (error) {
        console.log(`Warning: Could not remove ${dir}: ${error.message}`);
      }
    }
  }
}

// READMEファイルを作成
function createREADME() {
  const readmeContent = `# Notion-Keep 整理済みディレクトリ

このディレクトリは以下の構造で整理されています。

## ディレクトリ構造

\`\`\`
Notion-Keep/
├── scripts/          # スクリプトファイル（.js, .py）
├── data/            # データファイル
│   ├── csv/         # CSVファイル
│   ├── exports/     # エクスポートデータ（Notion/Google Takeout）
│   └── temp/        # 一時ファイル
├── organized/       # 整理済みファイル
├── config/          # 設定ファイル（.env, .mcp.json）
└── outputs/         # 出力ファイル
\`\`\`

## 各ディレクトリの説明

### scripts/
すべてのスクリプトファイル（JavaScript、Python）を格納します。

### data/
各種データファイルを格納します。
- \`csv/\`: CSVファイル
- \`exports/\`: NotionやGoogle Takeoutのエクスポートデータ
- \`temp/\`: 一時ファイル

### organized/
整理済みのファイルを格納します。

### config/
設定ファイルを格納します。

### outputs/
スクリプトの出力ファイルを格納します。

## 使用方法

各スクリプトを実行する際は、適切なディレクトリから実行してください。

\`\`\`bash
# 例：Notionページを取得
cd scripts
node fetch_page.js

# 例：ディレクトリを整理
node organize_directory.js
\`\`\`
`;

  const readmePath = path.join(baseDir, 'README.md');
  fs.writeFileSync(readmePath, readmeContent, 'utf8');
  console.log(`Created README.md`);
}

// メイン処理
function main() {
  console.log('Starting directory organization...\n');
  
  // 構造を処理
  processStructure(structure);
  
  // 不要なディレクトリを削除
  console.log('\nCleaning up unwanted directories...');
  cleanupUnwantedDirs();
  
  // READMEを作成
  console.log('\nCreating README.md...');
  createREADME();
  
  console.log('\nDirectory organization completed!');
}

main();
