# RPG Maker MV 存档实验室

Windows Electron MVP。游戏目录始终只读；应用只允许将副本以独占创建方式导出到游戏 `save` 目录之外。

```powershell
pnpm install
pnpm test
pnpm build
pnpm dev
```

渲染器启用 `contextIsolation` 和 `sandbox`，没有 Node 权限。所有补丁在主进程服务中按白名单与数据库规则重新验证。LZString 在有 5 秒上限的 Worker 中运行，不加载或执行游戏脚本。
