// Only display known business messages; SDK stacks and unknown diagnostics stay in logs.
const BUSINESS_MESSAGES = [
  ['至少需要 4 名正常球员', '至少需要 4 名参赛球员，请先添加或恢复球员后再排赛'],
  ['数据已被其他人更新', '比赛数据已更新，请刷新后重试'],
  ['重新开始比赛需要最新数据', '比赛数据已更新，请刷新后再重新开始'],
  ['仅创建者可以管理比赛', '只有比赛创建者可以进行此操作'],
  ['未找到该比赛', '未找到比赛，请检查邀请码是否正确'],
  ['未找到该小局', '这局比赛已变更，请刷新赛程后重试'],
  ['缺少比赛编号', '请先输入邀请码进入比赛'],
  ['请输入 6 位邀请码', '请输入 6 位数字邀请码'],
  ['邀请码必须是 6 位数字', '请输入 6 位数字邀请码'],
  ['邀请码已被使用，请更换一个', '这个邀请码已被使用，请换一个；加入已有比赛请返回加入页面'],
  ['请输入比赛名称', '请填写比赛名称'],
  ['球员编号无效', '球员名单有误，请刷新名单后重试'],
  ['球员 ID 必须唯一，等级必须为高、中、次中或低', '球员名单有误，请检查球员及水平设置'],
  ['没有待生成的赛程', '没有待开始的比赛，可选择继续加赛或重新开始比赛'],
  ['当前历史赛程无法同时满足局数与休息约束', '暂时无法兼顾局数与休息，请增加场次或重排待开始赛程'],
  ['当前人员组合无法生成合法赛程', '暂时无法安排完整赛程，请调整参赛人数后重试'],
  ['当前人员组合无法生成完整赛程', '暂时无法安排完整赛程，请调整参赛人数后重试'],
  ['当前人员组合无法追加合法赛程', '暂时无法追加赛程，请调整参赛人数后重试'],
  ['请填写双方比分（0 分也请填写 0）', '请填写双方比分（0 分也请填写 0）'],
  ['比分必须是非负整数', '比分必须是非负整数'],
  ['球员姓名不能重复', '球员姓名不能重复'],
  ['请先在 miniprogram/config.js 填写云开发环境 ID', '比赛服务暂未配置，请联系比赛创建者'],
  ['不支持的操作', '此功能暂不可用，请更新小程序后重试']
]

function friendlyErrorMessage(error) {
  const text = typeof error === 'string' ? error : [error && error.message, error && error.errMsg]
    .filter(value => typeof value === 'string').join('\n')
  const business = BUSINESS_MESSAGES.find(([reason]) => text.includes(reason))
  if (business) return business[1]
  if (/timeout|timed out|超时/i.test(text)) return '请求超时，请稍后重试'
  if (/network|网络|断网|ECONN|ENOTFOUND|EAI_AGAIN|offline/i.test(text)) return '网络连接不稳定，请检查网络后重试'
  return '操作未完成，请稍后重试'
}

module.exports = { friendlyErrorMessage }
