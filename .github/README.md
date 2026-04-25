# 构建指南

## 自动构建

当创建 Git Tag 并推送到 GitHub 时，GitHub Actions 会自动构建所有平台的安装包：

```bash
# 创建并推送 tag
git tag v2.0.0
git push origin v2.0.0
```

版本号会自动从 tag 中提取（如 `v2.0.0` → `2.0.0`）。

## 自动构建产物

### Windows
- `kvctlTool-2.0.0-x64-setup.exe` - NSIS 安装程序
- `kvctlTool-2.0.0-x64-portable.exe` - 便携版（无需安装）

### Linux
- `kvctlTool-2.0.0-x64.deb` - Debian/Ubuntu 安装包
- `kvctlTool-2.0.0-x64.AppImage` - AppImage 便携包

### macOS
- `kvctlTool-2.0.0-x64.dmg` - DMG 安装包
- `kvctlTool-2.0.0-arm64.dmg` - Apple Silicon 版本

## 手动构建

### 准备工作

1. 安装 Node.js 20+
2. 安装 pnpm: `npm install -g pnpm`
3. 安装依赖: `pnpm install`

### 构建命令

```bash
# 构建所有平台
pnpm build

# 仅构建 Windows
pnpm build:win

# 仅构建 Linux
pnpm build:linux

# 仅构建 macOS
pnpm build:mac
```

### 构建产物位置

所有构建产物位于 `release/` 目录。

## 图标要求

在 `public/` 目录放置以下图标文件（可选，不放置则使用默认图标）：

| 平台 | 文件名 | 格式 | 推荐尺寸 |
|------|--------|------|----------|
| Windows | `icon.ico` | ICO | 256x256+ |
| Linux | `icon.png` | PNG | 512x512 |
| macOS | `icon.icns` | ICNS | 512x512+ |

## CI/CD 配置

- **ci.yml**: PR 和 push 时运行代码检查（类型检查、安全审计）
- **build.yml**: Tag 推送时触发多平台构建并发布 Release
