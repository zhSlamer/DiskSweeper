#!/usr/bin/env bash
# 创建 GitHub Release v1.0.1 并上传安装包（凭据来自 git credential manager，不落盘到仓库）
set -euo pipefail
cd "$(dirname "$0")/.."

PROXY="http://127.0.0.1:7890"
REPO="zhSlamer/DiskSweeper"

# 取凭据（stdin 供 git credential fill 使用）
TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | grep '^password=' | cut -d= -f2-)
if [ -z "$TOKEN" ]; then echo "no token"; exit 1; fi
trap 'unset TOKEN' EXIT

BODY=$(cat <<'JSON'
{
  "tag_name": "v1.0.1",
  "target_commitish": "main",
  "name": "v1.0.1",
  "body": "## 修复\n\n- **打开文件行为修正**：文件属性抽屉的主按钮改为「打开所在位置」，点击后直接在资源管理器中定位该文件，不再用默认程序打开文件\n- **可执行文件运行确认**：「打开文件」对 exe / msi / bat 等可执行文件增加二次确认，避免误运行\n- **操作列直达定位**：智能筛选结果表与空间分析大文件榜新增定位按钮，一键打开文件所在文件夹\n\n## 下载\n\n- `DiskSweeper-1.0.1-setup.exe`：安装版\n- `DiskSweeper-1.0.1-portable.exe`：便携版，免安装\n\n**Full Changelog**: https://github.com/zhSlamer/DiskSweeper/compare/v1.0.0...v1.0.1",
  "draft": false,
  "prerelease": false
}
JSON
)

echo "== create release =="
RESP=$(curl -sS -x "$PROXY" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d "$BODY" \
  "https://api.github.com/repos/$REPO/releases")

RELEASE_ID=$(echo "$RESP" | grep -o '"id": *[0-9]*' | head -1 | grep -o '[0-9]*')
if [ -z "$RELEASE_ID" ]; then
  echo "create failed:"; echo "$RESP" | head -5; exit 1
fi
echo "release id=$RELEASE_ID"

upload() {
  local FILE="$1" NAME="$2"
  echo "== upload $NAME =="
  local R
  R=$(curl -sS -x "$PROXY" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@$FILE" \
    "https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets?name=$NAME")
  echo "$R" | grep -o '"state": *"[a-z]*"' | head -1 || { echo "upload failed:"; echo "$R" | head -5; exit 1; }
}

upload "dist/DiskSweeper-1.0.1-setup.exe" "DiskSweeper-1.0.1-setup.exe"
upload "dist/DiskSweeper-1.0.1-portable.exe" "DiskSweeper-1.0.1-portable.exe"
echo "DONE"
