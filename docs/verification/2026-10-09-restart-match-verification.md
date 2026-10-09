# 管理员重新开始比赛验证

2026-10-09；功能方案见 `docs/superpowers/specs/2026-10-09-restart-match.md`。

## 自动化

`node --test tests/*.test.cjs cloudfunctions/match/tests/*.test.cjs frontend/tests/scheduler.test.mjs`：103 项通过，0 失败。原始输出见 `restart-tests.txt`。

检查中途/结束状态下重开、6–9 人排赛配额与连打、保留名单和邀请码、创建者鉴权、缺失/过期版本拒绝、生成失败及不足人数不写库、条件更新冲突、多次重开及追加不重用内部编号、旧比分提交拒绝、旧响应不能覆盖新赛程、取消和失败保留草稿、等待名单保存及防重复操作。

## 微信开发者工具

`node scripts/verify-wechat-restart.cjs` 验证真实原生页面和按钮、模拟弹窗确认/取消、真实云函数入口与排赛逻辑，数据库与页面云请求使用内存数据。确认前已完成 3 局；取消保留比分草稿；确认后原邀请码不变、15 局新赛程、第 1 局进行中、内部 ID 从 16 开始、排名和原生比分输入归零。结束后恢复页面、云请求方法及 wx.showModal。

结果：`wechat-restart-result.json`；截图：`wechat-restart-admin.jpg`、`wechat-restart-fresh-match.jpg`。不修改真实云数据库。

## 部署

当前环境 `cloud1-d0gwahv5k7b959610`，AppID `wx5175a5a34861be70`。部署对象仅 `match` 云函数。

用户在开发者工具确认后，查询同一任务 `confirmation_cloud_fn_deploy_fec98118-ef46-4170-b8b5-1cd56dbd80ec`，返回 `status: success` 和 `detail: execution_success`，部署 7 个文件、13.1 KB。云函数状态为 Active，Nodejs16.13。已刷新模拟器，并真实只读调用 `getMatch` 成功，返回 `ok: true`。

部署任务结果、当前函数状态、源码 SHA256 和只读调用证据保存到 `wechat-restart-deployment.json`；部署时源码与当前源码哈希一致。未上传或发布小程序版本，未重置真实比赛。
