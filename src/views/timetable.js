/**
 * RailKale: Next PC - 时刻表
 */

import { registerView, navigate } from '../js/router.js'
import { getTrainTimeTable } from '../js/api.js'
import { today, escapeHTML, apiErrMsg } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

let state = { train: '', date: today(), info: {}, stops: [], loading: false, searched: false, autoQuery: false }

function esc(s) { return escapeHTML(s) }

function render(host) {
  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:#34c759"><i class="fas fa-calendar-alt"></i></div>
        <div>
          <div class="page-title">时刻表</div>
          <div class="page-subtitle">查看车次全部停靠站与到发时刻</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="form-row">
        <div class="field">
          <label class="field-label">车次号</label>
          <input class="input" id="f-train" placeholder="如：G1" value="${esc(state.train)}" />
        </div>
        <div class="field narrow">
          <label class="field-label">日期</label>
          <input class="input" type="date" id="f-date" value="${esc(state.date)}" />
        </div>
        <button class="btn" id="btn-search" style="height:40px"><i class="fas fa-search"></i> 查询</button>
      </div>
    </div>

    <div id="result-host"></div>
  `

  const trainEl = host.querySelector('#f-train')
  const dateEl = host.querySelector('#f-date')
  const resultHost = host.querySelector('#result-host')

  function paint() {
    if (!state.searched) { resultHost.innerHTML = ''; return }
    if (state.loading) {
      resultHost.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在查询时刻表…</span></div>`
      return
    }
    if (!state.stops.length) {
      resultHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-calendar-alt empty-icon"></i>
        <div class="empty-text">未查询到该车次时刻表</div>
      </div>`
      return
    }

    const info = state.info || {}
    const rows = state.stops.map((s, i) => `
      <div class="timeline-row">
        <div class="timeline-track">
          <div class="timeline-dot ${i === 0 ? 'first' : (i === state.stops.length - 1 ? 'last' : '')}"></div>
          ${i < state.stops.length - 1 ? '<div class="timeline-line"></div>' : ''}
        </div>
        <div class="timeline-content">
          <div class="timeline-station">
            <span class="timeline-seq">${i + 1}</span>
            <span>${esc(s.station_name)}</span>
          </div>
          ${s.stopover_display ? `<div class="timeline-meta">停靠 ${esc(s.stopover_display)}</div>` : ''}
        </div>
        <div class="timeline-times">
          <div class="timeline-time-block">
            <span class="timeline-time-label">到达</span>
            <span class="timeline-time-value">${esc(s.arrive_time || '—')}</span>
          </div>
          <div class="timeline-time-block">
            <span class="timeline-time-label">出发</span>
            <span class="timeline-time-value">${esc(s.depart_time || '—')}</span>
          </div>
        </div>
      </div>
    `).join('')

    resultHost.innerHTML = `
      <div class="card" style="margin-top:18px;background:linear-gradient(135deg,#007aff,#4a90d9);border:none;color:#fff">
        <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
          <div style="font-size:34px;font-weight:700;letter-spacing:-1px">${esc(info.train_number || state.train)}</div>
          <div style="flex:1;min-width:180px">
            <div style="font-size:15px">${esc(info.origin || '')} → ${esc(info.destination || '')}</div>
            <div style="font-size:13px;opacity:.85;margin-top:2px">${esc(info.depart_time || '')} - ${esc(info.arrive_time || '')}</div>
          </div>
          <div style="display:flex;gap:10px">
            <span class="tag-pill" style="background:rgba(255,255,255,.22);color:#fff">${esc(state.date)}</span>
            <span class="tag-pill" style="background:rgba(255,255,255,.22);color:#fff">共 ${esc(info.total_stops || state.stops.length)} 站</span>
          </div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px">
          <button class="btn btn-sm btn-ghost" id="btn-locate" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-map-marker-alt"></i> 实时位置</button>
          <button class="btn btn-sm btn-ghost" id="btn-linemap" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-map"></i> 线路图</button>
          <button class="btn btn-sm btn-ghost" id="btn-export" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-copy"></i> 复制时刻</button>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-title">停靠站时刻</div>
        <div class="timeline">${rows}</div>
      </div>
    `

    resultHost.querySelector('#btn-locate')?.addEventListener('click', () => navigate('train-locate', { train: state.train }))
    resultHost.querySelector('#btn-linemap')?.addEventListener('click', () => navigate('line-map', { train: state.train }))
    resultHost.querySelector('#btn-export')?.addEventListener('click', async () => {
      const text = state.stops.map(s =>
        `${s.station_name}\t到达 ${s.arrive_time || '—'}\t出发 ${s.depart_time || '—'}`
      ).join('\n')
      const { copyText } = await import('../js/util.js')
      const ok = await copyText(`${state.train} 时刻表 (${state.date})\n${text}`)
      ok ? toast('已复制到剪贴板', { icon: 'success' }) : toastError('复制失败')
    })
  }

  async function doSearch() {
    state.train = trainEl.value.trim().toUpperCase()
    state.date = dateEl.value
    if (!state.train) { toast('请输入车次号'); return }
    state.loading = true
    state.searched = true
    state.stops = []
    paint()
    try {
      const res = await getTrainTimeTable(state.train, state.date)
      state.loading = false
      if (res && res.code === 0 && res.data) {
        state.info = res.data
        state.stops = res.data.stops || []
      } else {
        state.stops = []
        toastError((res && res.msg) || '查询失败')
      }
      paint()
    } catch (e) {
      state.loading = false
      state.stops = []
      paint()
      toastError(apiErrMsg(e))
    }
  }

  host.querySelector('#btn-search').addEventListener('click', doSearch)
  trainEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch() })

  if (state.searched) paint()
  // 从车次查询跳转过来时自动查询一次（消费掉标记，避免重复触发）
  if (state.autoQuery) {
    state.autoQuery = false
    doSearch()
  }
}

registerView('timetable', {
  title: '时刻表',
  icon: 'fa-calendar-alt',
  color: '#34c759',
  render,
  onEnter(params) {
    if (params && params.train) {
      state.train = params.train
      state.date = params.date || state.date
      state.searched = false
      state.autoQuery = true   // 带参进入时自动查询一次
    }
  }
})
