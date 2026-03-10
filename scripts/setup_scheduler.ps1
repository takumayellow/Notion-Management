# Notionページ自動整理 - Windowsタスクスケジューラ設定スクリプト
# 実行方法: PowerShell (管理者) で
#   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
#   .\scripts\setup_scheduler.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$NodePath = (Get-Command node).Source
$ScriptPath = Join-Path $ScriptDir "auto_organize.js"
$LogPath = Join-Path $ProjectDir "outputs\scheduler.log"

# 既存タスクがあれば削除
$TaskName = "NotionAutoOrganize"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "既存のタスク '$TaskName' を削除しました。"
}

# アクション: node auto_organize.js を実行、ログをファイルへ
$Action = New-ScheduledTaskAction `
    -Execute $NodePath `
    -Argument "`"$ScriptPath`"" `
    -WorkingDirectory $ProjectDir

# トリガー: 毎週月曜 09:00
$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At "09:00"

# 設定
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable

# タスク登録
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Notionページの末尾未整理ブロックを自動分類整理する（毎週月曜 09:00）" `
    -RunLevel Limited

Write-Host ""
Write-Host "✅ タスク '$TaskName' を登録しました。"
Write-Host "   スケジュール: 毎週月曜 09:00"
Write-Host "   スクリプト: $ScriptPath"
Write-Host ""
Write-Host "手動実行テスト:"
Write-Host "  node `"$ScriptPath`" --dry-run"
Write-Host "  node `"$ScriptPath`""
