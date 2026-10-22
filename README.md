# 羽球开场

羽毛球双打比赛管理项目，包含两个运行形态：

- `frontend/`：Vue 3 + Vite 的移动端优先网页原型，适合本地演示和规则验证。
- `miniprogram/` + `cloudfunctions/`：原生微信小程序与云开发版本，比赛数据由云函数访问云数据库。
- `backend/`：排赛和数据模型的 Python 代码，供后续服务化接入使用。

## 本地网页原型

```powershell
cd frontend
npm install
npm run dev
```

浏览器打开终端显示的本地地址。生产构建：

```powershell
npm run build
```

## 微信小程序与云开发

使用微信开发者工具导入仓库根目录，先阅读 [微信云开发部署说明](README-wechat-cloud.md)，再按目标环境配置云数据库和部署 `cloudfunctions/match`。云环境、AppID、数据库权限和体验成员应在本地开发环境中配置，不要把凭证提交到仓库。

## 验证

常用本地回归命令：

```powershell
node --test tests/*.test.cjs cloudfunctions/match/tests/*.test.cjs frontend/tests/scheduler.test.mjs
```

页面验证和云函数部署验证脚本位于 `scripts/`，运行前请先确认微信开发者工具和目标环境配置正确。

## 数据边界

网页原型使用浏览器本地数据；小程序版本使用配置的云开发环境。请不要把真实比赛记录、用户信息、云端密钥或本机配置文件提交到公开仓库。
