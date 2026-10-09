# 友好错误提示验证

截图中的人数不足错误由云端抛出，微信 SDK 包装出错误码、堆栈和追踪信息，原生页面 `showError` 直接展示 `error.message`。新增前端 `error-message.js` 统一识别已知业务原因，返回固定中文提示，支持 Error.message 和 SDK.errMsg；未知异常使用简短通用提示，原始异常仅写控制台。显示错误时清除旧成功提示。

先加入回归测试，观察原页面暴露包装错误、SDK 对象错误丢失业务原因以及空错误导致异常，再实施修复。

`node --test tests/*.test.cjs cloudfunctions/match/tests/*.test.cjs frontend/tests/scheduler.test.mjs`：120 项通过，0 失败。涵盖人数不足、版本冲突、权限、邀请码、赛程变化、历史约束、网络/超时、未知异常、空异常、本地比分校验，以及真实页面调用链收到 SDK 拒绝时的展示和按钮解锁。既有比分草稿、重新开始及排赛测试保持通过。

`node scripts/verify-wechat-errors.cjs`：微信原生按钮点击后页面只展示「至少需要 4 名参赛球员，请先添加或恢复球员后再排赛」，无 SDK 错误码、函数路径、链接及追踪信息；未知错误只显示「操作未完成，请稍后重试」。控制按钮恢复可用，旧成功提示清除。证据见 `wechat-friendly-error-result.json`、`wechat-friendly-error.jpg`。

已重新编译微信模拟器。测试使用临时页面与模拟云请求，结束后恢复页面，不修改真实比赛。修改仅在小程序前端，无需云函数部署。语法及 git diff --check 通过（既有文件存在 LF/CRLF 提示）。
