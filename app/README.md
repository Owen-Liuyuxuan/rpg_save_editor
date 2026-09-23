# RPG Maker MV/MZ 存档实验室

项目首页及完整中英文安装说明见 [README.md](../README.md) / [README.en.md](../README.en.md)。

Windows Electron MVP。游戏目录始终只读；应用只允许将副本以独占创建方式导出到游戏 `save` 目录之外。

```powershell
pnpm install
pnpm test
pnpm build
pnpm dev
```

渲染器启用 `contextIsolation` 和 `sandbox`，没有 Node 权限。所有补丁在主进程服务中按白名单与数据库规则重新验证。MV 使用 LZString，MZ 使用内置 zlib 兼容 `pako.deflate` 的存档编解码；两者都在有 5 秒上限的 Worker 中运行，不加载或执行游戏脚本。
