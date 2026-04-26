# kvctlTool

**kvctlTool** 是一款专为 `etcdctl` / `craftctl` 等 KV 命令行工具打造的现代化图形化客户端，支持**本地直连**与 **SSH 远程执行**双模式，让分布式 KV 服务的日常运维与调试更加直观高效。

![软件界面截图](docs/demo.png)

---

## ✨ 主要特性

- **双模式执行**：本地模式直接调用系统命令，SSH 模式通过安全连接在远程服务器上执行，一键切换。
- **核心 KV 操作**：可视化完成 `get`、`put`、`del`、`member list` 等常用操作，无需记忆复杂命令参数。
- **自定义命令**：支持自由输入任意子命令，满足高级使用场景。
- **高级选项**：前缀查询（`--prefix`）、仅查询 Key（`--keys`）、保留输出历史等开关随心控制。
- **现代界面**：基于 Vue 3 + Element Plus 构建，支持深色/浅色主题切换，侧边栏布局清晰易用。
- **跨平台支持**：基于 Electron 打包，提供 Windows、Linux（AppImage / DEB / RPM / tar.gz）安装包。

---

## 🚀 快速开始

### 下载安装

前往 [Releases](https://github.com/your-username/kvctlTools/releases) 页面，根据你的操作系统下载对应安装包：

| 平台 | 安装包类型 |
|------|-----------|
| Windows | `.exe` (安装器) / `.zip` (便携版) |
| Linux | `.AppImage` / `.deb` / `.rpm` / `.tar.gz` |

### 使用说明

1. **选择执行模式**：点击顶部「本地模式」或「SSH 远程」标签切换。
2. **配置连接**：填写协议、IP/主机地址和端口。
3. **执行操作**：在左侧 KV 操作区输入 Key/Value，点击对应按钮即可执行。
4. **查看输出**：右侧命令输出区实时回显执行结果与耗时，支持复制、搜索、清空。

---

## 🛠️ 开发构建

```bash
# 安装依赖
npm install

# 开发调试
npm run dev

# 构建各平台安装包
npm run build:win:all    # Windows
npm run build:linux      # Linux（全部格式）
```

---


