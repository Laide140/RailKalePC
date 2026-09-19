/**
 * RailKale: Next PC - 车站大屏
 */

import { registerView } from '../js/router.js'
import { getStationBigScreen } from '../js/api.js'
import { resolveTelecode } from '../js/station.js'
import { escapeHTML, apiErrMsg } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

/**
 * 大屏状态码 → 样式类
 *
 * 接口实际返回短码（CHECKING / STOPPED / WAITING 等），
 * 同时兼容移动端历史使用的 CHECK_BEGIN / CHECK_STOP 命名。
 */
const STATUS_MAP = {
  ON_TIME: 'on-time',
  DELAY: 'delay',
  EARLY: 'early',
  CHECKING: 'checking',
  CHECK_BEGIN: 'checking',
  STOPPED: 'stopped',
  CHECK_STOP: 'stopped',
  CANCELED: 'canceled',
  CANCELLED: 'canceled',
  WAITING: 'waiting'
}

/** 未识别的状态码回退为中性样式，避免出现无样式裸文本 */
function statusClass(code) {
  return STATUS_MAP[String(code || '').toUpperCase()] || 'waiting'
}

let state = { station: '', list: [], loading: false, searched: false, title: '' }
let refreshTimer = null
let hostRef = null

function esc(s) { return escapeHTML(s) }

function render(host) {
  hostRef = host
  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:#5856d6"><i class="fas fa-desktop"></i></div>
        <div>
          <div class="page-title">车站大屏</div>
          <div class="page-subtitle">车站电子大屏样式的到发信息</div>
        </div>
      </div>
      <div id="auto-badge"></div>
    </div>

    <div class="card">
      <div class="form-row">
        <div class="field">
          <label class="field-label">车站名称或电报码</label>
          <input class="input" id="f-station" placeholder="如：北京南 / VNP" value="${esc(state.station)}" />
        </div>
        <button class="btn" id="btn-go" style="height:40px;background:#5856d6"><i class="fas fa-search"></i> 查询</button>
        <button class="btn btn-ghost" id="btn-auto" style="height:40px"><i class="fas fa-sync-alt"></i> 自动刷新</button>
      </div>
    </div>

    <div id="result-host"></div>
  `

  const input = host.querySelector('#f-station')
  const resultHost = host.querySelector('#result-host')
  const autoBadge = host.querySelector('#auto-badge')

  function paintBadge() {
    autoBadge.innerHTML = refreshTimer
      ? `<div style="display:flex;align-items:center;gap:8px" class="tag-pill green"><span class="pulse-dot"></span><span>30 秒自动刷新</span></div>`
      : ''
  }

  function paint() {
    paintBadge()
    if (!state.searched) {
      resultHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-desktop empty-icon"></i>
        <div class="empty-text">输入车站名称查询大屏信息</div>
      </div>`
      return
    }
    if (state.loading) {
      resultHost.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在查询大屏…</span></div>`
      return
    }
    if (!state.list.length) {
      resultHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-desktop empty-icon"></i>
        <div class="empty-text">暂无大屏数据</div>
      </div>`
      return
    }

    const rows = state.list.map(item => {
      const cls = statusClass(item.bigScreenStatusCode)
      return `<tr>
        <td class="time-cell mono">${esc(item.time)}</td>
        <td class="train-cell">${esc(item.trainNum)}</td>
        <td>${esc(item.trainStartStation || '')} / ${esc(item.trainEndStation || '—')}</td>
        <td><span class="status-tag ${cls}">${esc(item.bigScreenStatus || '—')}</span></td>
      </tr>`
    }).join('')

    resultHost.innerHTML = `
      <div class="screen-panel" style="margin-top:18px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div style="font-size:18px;font-weight:700;color:#fff">${esc(state.title || state.station)} 车站大屏</div>
          <div style="font-size:12px;color:#6d829b">共 ${state.list.length} 趟</div>
        </div>
        <div class="screen-legend">
          <div class="screen-legend-item"><span class="legend-dot on-time"></span>正点</div>
          <div class="screen-legend-item"><span class="legend-dot delay"></span>晚点</div>
          <div class="screen-legend-item"><span class="legend-dot early"></span>早点</div>
          <div class="screen-legend-item"><span class="legend-dot checking"></span>检票中</div>
          <div class="screen-legend-item"><span class="legend-dot stopped"></span>停检</div>
          <div class="screen-legend-item"><span class="legend-dot canceled"></span>取消</div>
          <div class="screen-legend-item"><span class="legend-dot waiting"></span>候车</div>
        </div>
        <div style="max-height:calc(100vh - 420px);overflow-y:auto">
          <table class="screen-table">
            <thead><tr><th style="width:90px">时间</th><th style="width:110px">车次</th><th>区间</th><th style="width:120px">状态</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `
  }

  async function doQuery(silent) {
    const val = input.value.trim()
    if (!val) { toast('请输入车站'); return }
    state.station = val
    state.loading = !silent
    state.searched = true
    if (!silent) paint()
    try {
      const { telecode, name } = await resolveTelecode(val)
      const res = await getStationBigScreen(telecode)
      state.loading = false
      if (res && res.success && res.data) {
        state.list = res.data
        state.title = name || val
      } else {
        state.list = []
        if (!silent) toastError((res && res.msg) || '查询失败')
      }
    } catch (e) {
      state.loading = false
      state.list = []
      if (!silent) toastError(apiErrMsg(e))
    }
    if (hostRef === host) paint()
  }

  function toggleAuto() {
    if (refreshTimer) {
      clearInterval(refreshTimer); refreshTimer = null
      toast('已关闭自动刷新')
    } else {
      refreshTimer = setInterval(() => { if (hostRef === host) doQuery(true); else clearInterval(refreshTimer) }, 30000)
      toast('已开启 30 秒自动刷新', { icon: 'success' })
    }
    paintBadge()
  }

  host.querySelector('#btn-go').addEventListener('click', () => doQuery(false))
  host.querySelector('#btn-auto').addEventListener('click', toggleAuto)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doQuery(false) })

  paint()
  if (state.searched && state.list.length) paint()
}

registerView('station-screen', {
  title: '车站大屏',
  icon: 'fa-desktop',
  color: '#5856d6',
  render,
  destroy() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
    hostRef = null
  }
})
