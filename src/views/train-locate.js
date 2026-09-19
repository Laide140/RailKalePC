/**
 * RailKale: Next PC - 列车实时位置
 * 2 秒轮询，含车组担当号与高德静态地图
 */

import { registerView } from '../js/router.js'
import { getTrainLocate } from '../js/api.js'
import { getKey } from '../js/keys.js'
import { escapeHTML, apiErrMsg } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

const POLL_MS = 2000

let state = {
  train: '',
  data: null,
  emu: '',
  error: '',
  loading: false,
  polling: false,
  autoQuery: false
}

let timer = null
let hostRef = null

function stopPolling() {
  state.polling = false
  if (timer) { clearInterval(timer); timer = null }
}

function esc(s) { return escapeHTML(s) }

function statusInfo(d) {
  if (!d) return { cls: 'waiting', icon: 'fa-train', text: '' }
  if (d.status === 'running') return { cls: 'running', icon: 'fa-train', text: '运行中' }
  if (d.status === 'arrived') return { cls: 'arrived', icon: 'fa-check-circle', text: '已到达' }
  return { cls: 'waiting', icon: 'fa-pause-circle', text: '等待中' }
}

function mapUrl(d) {
  if (!d || !d.position) return ''
  const pos = d.position
  const lng = pos.gcj02_lng || pos.lng
  const lat = pos.gcj02_lat || pos.lat
  if (!lng || !lat) return ''
  const marker = encodeURIComponent(`large,0xDD3333,T:${lng},${lat}`)
  return `https://restapi.amap.com/v3/staticmap?location=${lng},${lat}&zoom=15&size=1024*520&markers=${marker}&key=${getKey('amap')}`
}

function render(host) {
  hostRef = host
  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:#ff2d55"><i class="fas fa-map-marker-alt"></i></div>
        <div>
          <div class="page-title">列车实时位置</div>
          <div class="page-subtitle">每 2 秒自动刷新，含车组担当号</div>
        </div>
      </div>
      <div id="live-badge"></div>
    </div>

    <div class="card">
      <div class="form-row">
        <div class="field">
          <label class="field-label">车次号</label>
          <input class="input" id="f-train" placeholder="如：D190" value="${esc(state.train)}" />
        </div>
        <button class="btn" id="btn-go" style="height:40px"><i class="fas fa-crosshairs"></i> 定位</button>
        <button class="btn btn-ghost" id="btn-stop" style="height:40px"><i class="fas fa-stop"></i> 停止追踪</button>
      </div>
      ${!getKey('amap') ? `<div class="field-hint" style="margin-top:10px;color:var(--orange)">
        <i class="fas fa-info-circle"></i> 未配置高德 Web 服务密钥，地图将无法显示（设置 → 接口密钥）
      </div>` : ''}
    </div>

    <div id="result-host"></div>
  `

  const trainEl = host.querySelector('#f-train')
  const resultHost = host.querySelector('#result-host')
  const badgeHost = host.querySelector('#live-badge')

  function paintBadge() {
    badgeHost.innerHTML = state.polling
      ? `<div style="display:flex;align-items:center;gap:8px" class="tag-pill green">
           <span class="pulse-dot"></span><span>实时追踪中（2 秒/次）</span>
         </div>`
      : `<span class="tag-pill gray">未追踪</span>`
  }

  function paint() {
    paintBadge()

    if (state.loading && !state.data) {
      resultHost.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在查询列车位置…</span></div>`
      return
    }
    if (state.error && !state.data) {
      resultHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-times-circle empty-icon" style="color:var(--red)"></i>
        <div class="empty-text">${esc(state.error)}</div>
        <button class="btn" id="btn-retry">重试</button>
      </div>`
      resultHost.querySelector('#btn-retry')?.addEventListener('click', doQuery)
      return
    }
    if (!state.data) {
      resultHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-map-marker-alt empty-icon"></i>
        <div class="empty-text">输入车次号查询列车实时位置</div>
      </div>`
      return
    }

    const d = state.data
    const st = statusInfo(d)
    const pos = d.position || {}
    const lng = pos.gcj02_lng || pos.lng
    const lat = pos.gcj02_lat || pos.lat
    const url = mapUrl(d)

    resultHost.innerHTML = `
      <div class="status-hero status-${st.cls}" style="
        display:flex;align-items:center;gap:16px;padding:18px 22px;border-radius:var(--radius);
        margin:18px 0;color:#fff;background:${
          st.cls === 'running' ? 'linear-gradient(135deg,#50C878,#2ECC71)'
          : st.cls === 'arrived' ? 'linear-gradient(135deg,#8e8e93,#636366)'
          : 'linear-gradient(135deg,#F39C12,#E67E22)'
        }">
        <i class="fas ${st.icon}" style="font-size:30px"></i>
        <div style="flex:1">
          <div style="font-size:19px;font-weight:700">${esc(st.text)}</div>
          <div style="font-size:12.5px;opacity:.9;margin-top:2px">${esc(d.time || '')}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:26px;font-weight:700;letter-spacing:-.5px">${esc(d.train || state.train)}</div>
          <div style="font-size:12.5px;opacity:.9">进度 ${esc(d.progress || '—')}</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title">运行信息</div>
          <table class="data-table">
            <tbody>
              <tr><td style="color:var(--secondary);width:110px">列车</td><td><b>${esc(d.train || state.train)}</b></td></tr>
              ${d.from_station || d.to_station ? `<tr><td style="color:var(--secondary)">运行区间</td><td>${esc(d.from_station || '?')} → ${esc(d.to_station || '?')}</td></tr>` : ''}
              <tr><td style="color:var(--secondary)">当前进度</td><td style="color:var(--orange);font-weight:700">${esc(d.progress || '—')}</td></tr>
              <tr><td style="color:var(--secondary)">车组号</td><td>${esc(state.emu || '查询中…')}</td></tr>
              ${d.segment ? `<tr><td style="color:var(--secondary)">本段区间</td><td>${esc(d.segment.depart_time || '')} - ${esc(d.segment.arrive_time || '')}</td></tr>` : ''}
              <tr><td style="color:var(--secondary)">当前位置</td><td>${esc(d.station ? (d.station + ' ' + (d.progress || '')) : st.text)}</td></tr>
              <tr><td style="color:var(--secondary)">经纬度</td><td class="mono">${lng ? Number(lng).toFixed(5) : '—'}, ${lat ? Number(lat).toFixed(5) : '—'}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:14px 16px 10px" class="card-title" >位置地图</div>
          <div style="height:360px;background:var(--fill2)">
            ${url
              ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover" alt="地图"
                     onerror="this.parentElement.innerHTML='<div class=\\'map-placeholder\\'><i class=\\'fas fa-map\\' style=\\'font-size:32px\\'></i><div>静态地图加载失败，请检查高德密钥</div></div>'" />`
              : `<div class="map-placeholder"><i class="fas fa-map" style="font-size:32px"></i><div>暂无坐标数据</div></div>`}
          </div>
        </div>
      </div>
    `
  }

  async function query() {
    const t = state.train
    if (!t) return
    try {
      const res = await getTrainLocate(t)
      if (res && res.code === 0 && res.data) {
        state.data = res.data
        state.error = ''
        if (!state.polling) startPolling()
      } else if (res && res.code === 0 && !res.data) {
        stopPolling()
        state.data = null
        state.error = '列车已到达终点或尚未发车'
      } else {
        stopPolling()
        state.error = (res && res.msg) || '查询失败'
        state.data = null
      }
    } catch (e) {
      stopPolling()
      if (!state.data) state.error = apiErrMsg(e)
    }
    if (hostRef === host) paint()
  }

  async function fetchEmu(train) {
    try {
      const res = await fetch('https://api.rail.re/train/' + encodeURIComponent(train))
      const arr = await res.json()
      if (Array.isArray(arr) && arr.length) {
        const ds = new Date()
        const todayStr = `${ds.getFullYear()}-${String(ds.getMonth() + 1).padStart(2, '0')}-${String(ds.getDate()).padStart(2, '0')}`
        const f = arr.find(x => x.date && x.date.indexOf(todayStr) === 0)
        state.emu = (f && f.emu_no) || arr[0].emu_no || ''
        if (hostRef === host) paint()
      }
    } catch (e) { /* 非关键信息，忽略 */ }
  }

  async function doQuery() {
    state.train = trainEl.value.trim().toUpperCase()
    if (!state.train) { toast('请输入车次号'); return }
    stopPolling()
    state.loading = true
    state.error = ''
    state.emu = ''
    state.data = null
    paint()
    await query()
    state.loading = false
    paint()
    fetchEmu(state.train)
  }

  function startPolling() {
    stopPolling()
    state.polling = true
    timer = setInterval(() => { if (hostRef === host) query(); else stopPolling() }, POLL_MS)
  }

  host.querySelector('#btn-go').addEventListener('click', doQuery)
  host.querySelector('#btn-stop').addEventListener('click', () => {
    stopPolling()
    toast('已停止追踪')
    paint()
  })
  trainEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doQuery() })

  paint()
  if (state.data) { startPolling(); paint() }
  // 从时刻表跳转过来时自动定位一次（消费掉标记，避免重复触发）
  if (state.autoQuery) {
    state.autoQuery = false
    doQuery()
  }
}

registerView('train-locate', {
  title: '实时位置',
  icon: 'fa-map-marker-alt',
  color: '#ff2d55',
  render,
  onEnter(params) {
    if (params && params.train) {
      state.train = params.train
      state.autoQuery = true   // 带参进入时自动定位一次
    }
  },
  destroy() {
    stopPolling()
    hostRef = null
  }
})
