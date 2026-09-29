# 羽球开场 MVP

这是一个 Vue 3 + Vite 的移动端优先原型，模拟羽毛球双打比赛现场：

- 六位邀请码进入比赛，默认演示码：260920
- 当前局比分提交后自动进入下一局
- 任何人都可以修改历史小局比分，修改后实时重算净胜分
- 普通球员视角不显示高/中/低等级
- 管理员入口位于右上角，演示密码：8888
- 管理员可以添加球员、维护等级并重新生成未开始赛程
- 页面采用清爽活力球馆风格，支持手机宽度和桌面预览

## 启动

cd badminton-miniapp/frontend
npm install
npm run dev

打开 http://127.0.0.1:5173。

## 构建

cd badminton-miniapp/frontend
npm run build

当前原型使用浏览器 localStorage 保存演示数据，不依赖 FastAPI。后端排赛核心已放在 backend/app/scheduler.py，后续接入 API 时可以复用相同的比赛规则和数据结构。
