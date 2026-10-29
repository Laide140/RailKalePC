/**
 * RailKale: Next PC - 入口
 * 注册全部视图后启动应用外壳
 */

import { startApp } from './app.js'

// 视图（副作用导入：各自调用 registerView）
import '../views/home.js'
import '../views/train-detail.js'
import '../views/train-query.js'
import '../views/timetable.js'
import '../views/train-locate.js'
import '../views/train-radar.js'
import '../views/speed-test.js'
import '../views/station-screen.js'
import '../views/ticket-gate.js'
import '../views/traffic-query.js'
import '../views/station-code.js'
import '../views/station-area.js'
import '../views/emu-query.js'
import '../views/rail-network-map.js'
import '../views/route-planner.js'
import '../views/sale-time.js'
import '../views/line-map.js'
import '../views/souvenir-ticket.js'
import '../views/travel-ticket.js'
import '../views/train-broadcast.js'
import '../views/operation-share.js'
import '../views/big-data.js'
import '../views/section-detail.js'
import '../views/custom-editor.js'
import '../views/settings.js'
import '../views/mine.js'

startApp().catch((e) => {
  console.error('[启动失败]', e)
  document.body.innerHTML = `<div style="padding:60px;font-family:-apple-system,'PingFang SC',sans-serif">
    <h2 style="color:#ff3b30">应用启动失败</h2>
    <pre style="margin-top:16px;color:#8e8e93;white-space:pre-wrap">${e && e.stack ? e.stack : e}</pre>
  </div>`
})
