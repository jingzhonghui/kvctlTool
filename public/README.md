# 应用图标

本目录用于存放应用图标文件。

## 需要的图标文件

| 文件名 | 格式 | 尺寸 | 用途 |
|--------|------|------|------|
| `icon.ico` | ICO | 256x256+ | Windows 应用图标 |
| `icon.png` | PNG | 512x512 | Linux 应用图标 / macOS 备用 |
| `icon.icns` | ICNS | 512x512+ | macOS 应用图标 |

## 图标制作建议

1. **设计原稿**: 建议使用 1024x1024 的 PNG 作为原稿
2. **ICO 文件**: 可使用在线工具 (如 [CloudConvert](https://cloudconvert.com/png-to-ico)) 将 PNG 转换为 ICO
3. **ICNS 文件**: 可使用 macOS 的 `iconutil` 工具或在线工具转换

## 临时解决方案

如果暂时没有图标，electron-builder 会使用默认图标。
可以在 `package.json` 中暂时注释掉图标配置：

```json
"build": {
  "win": {
    "icon": null  // 或删除 icon 字段
  },
  "linux": {
    "icon": null  // 或删除 icon 字段
  }
}
```

## 推荐的图标设计

kvctlTool 是 craftctl 命令行工具的图形化客户端，建议图标包含：
- 键值对 (KV) 的视觉元素
- 连接/网络的元素
- 终端/命令行的元素
