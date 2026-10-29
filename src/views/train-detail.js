/**
 * RailKale: Next PC - 车次详情
 * 移植自移动端 pages/train-detail：时刻 / 运行 / 列车 三个标签页
 *
 * 桌面端改动：
 *  - 顶部改为「车次输入 + 日期 + 查询」工具栏，与结果常驻不互斥
 *  - 时刻页：左侧站点列表 + 右侧粘性信息卡（停台、检票口、车组、快捷跳转）
 *  - 运行页：静态路径地图与实时位置并排，不再竖向堆叠
 *  - 列车页：车组资料 / 车厢图 / 担当车次 三栏网格
 */

import { registerView, navigate } from '../js/router.js'
import {
  getTrainDetail, getTrainLocate, getAmapStaticMap, getPlatformMap,
  getTrainSetInfo, carPicUrl, cateringImageUrl
} from '../js/api.js'
import { getKey } from '../js/keys.js'
import { today, escapeHTML, apiErrMsg } from '../js/util.js'
import { addSearchHistory } from '../js/settings.js'
import { toast, toastError } from '../js/ui.js'

const POLL_MS = 10000

let state = {
  train: '',
  date: today(),
  loading: false,
  activeTab: 'time',
  timetable: null,
  platformMap: {},
  platformLoading: false,
  line: null,
  locate: null,
  trainSet: '',
  trainSetTrains: [],
  carInfo: [],
  carDiagrams: [],
  formation: 0,
  carPic: '',
  carInfoLoading: false,
  carPicFailed: false,
  carDiagramBroken: {},
  polling: false
}

let pollTimer = null
let loadToken = 0
let hostRef = null
let departAsked = ''

function esc(s) { return escapeHTML(s) }
function toMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''))
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

function stops() { return (state.timetable && state.timetable.stops) || [] }
function origin() { return (state.timetable && state.timetable.origin) || '' }
function destination() { return (state.timetable && state.timetable.destination) || '' }
function departTime() { return (state.timetable && state.timetable.depart_time) || '' }
function arriveTime() { return (state.timetable && state.timetable.arrive_time) || '' }

/** 跨天车：始发时间晚于终到时间 */
function isOvernight() {
  const dep = toMinutes(departTime())
  const arr = toMinutes(arriveTime())
  if (dep === null || arr === null) return false
  return dep > arr
}

/** 是否为「过去的车次」：过去车次不显示运行状态与「运行」标签页 */
function isPast() {
  const day = state.date || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const t = today()
  if (day >= t) return false
  // 昨天及更早。跨天车只有「昨天」这趟可能还在运行
  if (!isOvernight()) return true
  return day < dateMinus(t, 1)
}

function dateMinus(base, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(base || '')
  if (!m) return base
  const d = new Date(+m[1], +m[2] - 1, +m[3])
  d.setDate(d.getDate() + n)
  const p = (v) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 沿途各站相对查询日的天偏移（只对跨天车有意义）
 * 逐站比较出发与到达：发 > 到 说明跨过了一个零点
 */
function dayOffsets() {
  if (!isOvernight()) return []
  const list = stops()
  const out = []
  let day = 0
  for (let i = 0; i < list.length; i++) {
    const prev = list[i - 1]
    if (prev) {
      const d = toMinutes(prev.depart_time)
      const a = toMinutes(list[i].arrive_time)
      if (d !== null && a !== null && d > a) day += 1
    }
    out.push(day)
  }
  return out
}

function isRunning() {
  return !isPast() && !!(state.locate && state.locate.status === 'running')
}

function statusText() {
  if (isPast()) return ''
  if (!state.locate) return ''
  if (state.locate.status === 'running') return '运行中'
  if (state.locate.status === 'arrived') return '已到达'
  return '等待中'
}

function position() {
  const p = state.locate && state.locate.position
  if (!p) return null
  const lng = p.gcj02_lng || p.lng
  const lat = p.gcj02_lat || p.lat
  return (lng && lat) ? { lng, lat } : null
}

function positionText() {
  const p = position()
  return p ? `${Number(p.lng).toFixed(4)}, ${Number(p.lat).toFixed(4)}` : ''
}

function stationNames() {
  if (!state.line || !state.line.stations) return []
  return state.line.stations.map(s => Object.keys(s)[0])
}

function emuModel() {
  if (!state.trainSet) return ''
  const m = String(state.trainSet).match(/^(.*?)-\d+$/)
  return m ? m[1] : state.trainSet
}

/** 线路坐标点（按段 index 排序后拼成 "lng,lat" 列表） */
function routePoints() {
  const train = (state.line && state.line.train) || {}
  const segs = Object.keys(train)
    .map(k => ({ index: (train[k] && train[k].index) || 0, line: (train[k] && train[k].line) || [] }))
    .sort((a, b) => a.index - b.index)
  const out = []
  for (const seg of segs) {
    for (const p of seg.line) out.push(`${Number(p[0]).toFixed(4)},${Number(p[1]).toFixed(4)}`)
  }
  return out
}

function stationCoordStrs() {
  if (!state.line || !state.line.stations) return ''
  return state.line.stations
    .map(s => {
      const c = Object.values(s)[0]
      return c ? `${Number(c[0]).toFixed(4)},${Number(c[1]).toFixed(4)}` : null
    })
    .filter(Boolean)
    .join(';')
}

/**
 * 路径地图静态图：只画运行路径与途经车站。
 * 同组 markers 必须写在一条里且 label 不能省略（省略高德会报 20003）。
 */
function staticMapUrl(size) {
  if (!state.line) return ''
  const pts = routePoints()
  if (pts.length < 2) return ''
  const stations = stationCoordStrs()
  const parts = []
  if (stations) parts.push(`markers=${encodeURIComponent('mid,0x007AFF,0:' + stations)}`)
  parts.push(`paths=${encodeURIComponent('7,0x007AFF,1,,:' + pts.join(';'))}`)
  const base = getAmapStaticMap(size || '900*520', null, null)
  return base + (parts.length ? '&' + parts.join('&') : '')
}

/** 实时位置地图：小画布 + 近距缩放，让位置点在卡片里也清晰 */
function locateMapUrl() {
  const p = position()
  if (!p) return ''
  const marker = `large,0x007AFF,A:${p.lng},${p.lat}`
  return getAmapStaticMap('560*340', marker, null) + `&location=${p.lng},${p.lat}&zoom=15`
}

function platformOf(stop) {
  const p = state.platformMap[stop.station_name]
  return (p && p.platform) || ''
}

function entranceOf(stop) {
  const p = state.platformMap[stop.station_name]
  if (!p || !p.entrance || !p.entrance.length) return ''
  return p.entrance.join(' · ')
}

function isCurrentStop(stop) {
  if (!state.locate || !state.locate.station) return false
  return stop.station_name === state.locate.station
}

let host = null

function render(h) {
  host = h
  hostRef = h

  const tabItems = [{ key: 'time', label: '时刻' }]
  if (!isPast()) tabItems.push({ key: 'run', label: '运行' })
  tabItems.push({ key: 'train', label: '列车' })
  if (!tabItems.some(t => t.key === state.activeTab)) state.activeTab = 'time'

  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:var(--theme)"><i class="fas fa-train"></i></div>
        <div>
          <div class="page-title">车次详情</div>
          <div class="page-subtitle">时刻、运行位置与担当车组的一站式信息</div>
        </div>
      </div>
      ${state.polling ? `<div class="tag-pill green" style="display:flex;align-items:center;gap:8px">
        <span class="pulse-dot"></span><span>实时更新中</span></div>` : ''}
    </div>

    <div class="card">
      <div class="form-row">
        <div class="field" style="flex:2">
          <label class="field-label">车次号</label>
          <input class="input" id="f-train" placeholder="输入车次，如 G1" value="${esc(state.train)}" />
        </div>
        <div class="field narrow">
          <label class="field-label">日期</label>
          <input class="input" type="date" id="f-date" value="${esc(state.date)}" />
        </div>
        <button class="btn" id="btn-go" style="height:40px"><i class="fas fa-search"></i> 查询</button>
      </div>
    </div>

    <div id="hero-host"></div>

    <div class="tabs" id="tab-bar" style="max-width:420px">
      ${tabItems.map(t => `<div class="tab ${state.activeTab === t.key ? 'active' : ''}" data-tab="${t.key}">${esc(t.label)}</div>`).join('')}
    </div>

    <div id="panel-host"></div>
  `

  const trainEl = host.querySelector('#f-train')
  const dateEl = host.querySelector('#f-date')

  const doSearch = () => {
    const no = trainEl.value.trim().toUpperCase()
    if (!no) { toast('请输入车次号'); return }
    state.date = dateEl.value || today()
    loadTrain(no)
  }

  host.querySelector('#btn-go').addEventListener('click', doSearch)
  trainEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch() })
  dateEl.addEventListener('change', () => { if (state.train) loadTrain(state.train) })

  host.querySelectorAll('[data-tab]').forEach(el => {
    el.addEventListener('click', () => {
      state.activeTab = el.dataset.tab
      host.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x.dataset.tab === state.activeTab))
      paintPanel()
    })
  })

  paintHero()
  paintPanel()

  if (!state.train && !state.loading) {
    host.querySelector('#panel-host').innerHTML = `
      <div class="empty-state" style="padding:70px 20px">
        <i class="fas fa-train empty-icon"></i>
        <div class="empty-text">输入车次号，查看时刻、运行与担当信息</div>
        <div class="field-hint">也可以先在「车次查询」中按站查询，再点击车次进入本页</div>
      </div>`
  }
}

function paintHero() {
  const el = host && host.querySelector('#hero-host')
  if (!el) return
  if (!state.train) { el.innerHTML = ''; return }

  const st = statusText()
  const meta = []
  if (state.date) meta.push(esc(state.date))
  if (stops().length) meta.push(`共 ${stops().length} 站`)
  if (departTime() && arriveTime()) meta.push(`${esc(departTime())} - ${esc(arriveTime())}`)

  el.innerHTML = `
    <div class="card" style="margin-top:16px;background:linear-gradient(135deg,var(--theme),var(--theme-strong));border:none;color:#fff">
      <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
        <div style="font-size:36px;font-weight:700;letter-spacing:-1px">${esc(state.train)}</div>
        <div style="flex:1;min-width:180px">
          ${origin() ? `<div style="font-size:15px">${esc(origin())} → ${esc(destination())}</div>`
            : '<div style="font-size:15px;opacity:.85">暂无时刻信息</div>'}
          <div style="font-size:13px;opacity:.85;margin-top:3px">${meta.join(' · ')}</div>
        </div>
        ${st ? `<span class="tag-pill" style="background:rgba(255,255,255,.22);color:#fff">
          <i class="fas ${isRunning() ? 'fa-train' : 'fa-circle-info'}"></i> ${esc(st)}</span>` : ''}
      </div>
    </div>
  `
}

function paintPanel() {
  if (!host || !hostRef) return
  const panel = host.querySelector('#panel-host')
  if (!panel) return

  if (!state.train) {
    panel.innerHTML = `<div class="empty-state" style="padding:70px 20px">
      <i class="fas fa-train empty-icon"></i>
      <div class="empty-text">输入车次号，查看时刻、运行与担当信息</div>
      <div class="field-hint">也可以先在「车次查询」中按站查询，再点击车次进入本页</div>
    </div>`
    return
  }

  if (state.activeTab === 'run') paintRun(panel)
  else if (state.activeTab === 'train') paintTrain(panel)
  else paintTime(panel)
}

// ---------------------------------------------------------------------------
// 标签页一：时刻
// ---------------------------------------------------------------------------

function paintTime(panel) {
  const list = stops()

  if (state.loading && !list.length) {
    panel.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在查询 ${esc(state.train)} 次列车…</span></div>`
    return
  }
  if (!list.length) {
    panel.innerHTML = `<div class="empty-state">
      <i class="fas fa-calendar-alt empty-icon"></i>
      <div class="empty-text">未获取到时刻表数据</div>
      <div class="field-hint">请确认车次号与日期是否正确，或该车次当日不开行</div>
    </div>`
    return
  }

  const offsets = dayOffsets()
  const rows = list.map((s, i) => {
    const off = offsets[i]
    const dayTag = (off === undefined || off === 0) ? '' : (off < 0 ? '昨天' : '明天')
    const plat = platformOf(s)
    const entr = entranceOf(s)
    const current = isCurrentStop(s)
    return `
      <div class="timeline-row ${current ? 'is-current' : ''}">
        <div class="timeline-track">
          <div class="timeline-dot ${i === 0 ? 'first' : (i === list.length - 1 ? 'last' : '')}"></div>
          ${i < list.length - 1 ? '<div class="timeline-line"></div>' : ''}
        </div>
        <div class="timeline-content">
          <div class="timeline-station">
            <span class="timeline-seq">${i + 1}</span>
            ${dayTag ? `<span class="tag-pill gray" style="font-size:10px">${dayTag}</span>` : ''}
            <span>${esc(s.station_name)}</span>
            ${current ? '<span class="tag-pill blue" style="font-size:10px">当前</span>' : ''}
            ${plat ? `<span class="tag-pill orange" style="margin-left:auto">停靠 ${esc(plat)} 站台</span>` : ''}
          </div>
          ${s.stopover_display ? `<div class="timeline-meta">停靠 ${esc(s.stopover_display)}</div>` : ''}
          ${entr ? `<div class="timeline-meta"><i class="fas fa-sign-in-alt" style="margin-right:5px"></i>${esc(entr)}</div>` : ''}
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
    `
  }).join('')

  const t = typeOfTrain(state.train)
  panel.innerHTML = `
    <div class="detail-2col">
      <div class="card">
        <div class="card-title" style="display:flex;align-items:center;gap:10px">
          <span>停靠站时刻</span>
          ${state.platformLoading ? '<span class="text-small text-secondary"><i class="fas fa-sync-alt fa-spin"></i> 正在查询各站停台…</span>' : ''}
        </div>
        <div class="timeline">${rows}</div>
      </div>

      <div class="detail-side">
        <div class="card">
          <div class="card-title">列车概况</div>
          <table class="data-table">
            <tbody>
              <tr><td class="text-secondary" style="width:96px">车次</td><td><b>${esc(state.train)}</b>${t ? ` <span class="tag-pill gray">${esc(t)} 次</span>` : ''}</td></tr>
              <tr><td class="text-secondary">日期</td><td>${esc(state.date)}</td></tr>
              <tr><td class="text-secondary">始发</td><td>${esc(origin() || '—')} ${departTime() ? `<span class="mono text-secondary">${esc(departTime())} 开</span>` : ''}</td></tr>
              <tr><td class="text-secondary">终到</td><td>${esc(destination() || '—')} ${arriveTime() ? `<span class="mono text-secondary">${esc(arriveTime())} 到</span>` : ''}</td></tr>
              <tr><td class="text-secondary">停靠</td><td>共 ${list.length} 个车站</td></tr>
              <tr><td class="text-secondary">担当车组</td><td>${state.trainSet ? `<span class="mono">${esc(state.trainSet)}</span>` : '<span class="text-secondary">查询中…</span>'}</td></tr>
            </tbody>
          </table>
          <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px">
            <button class="btn btn-sm btn-ghost" id="btn-locate"><i class="fas fa-map-marker-alt"></i> 实时位置</button>
            <button class="btn btn-sm btn-ghost" id="btn-linemap"><i class="fas fa-map"></i> 线路图</button>
            <button class="btn btn-sm btn-ghost" id="btn-export"><i class="fas fa-copy"></i> 复制时刻</button>
          </div>
        </div>

        ${isOvernight() ? `<div class="card" style="border-color:var(--orange)">
          <div style="display:flex;gap:10px;align-items:flex-start">
            <i class="fas fa-moon" style="color:var(--orange);font-size:18px;margin-top:2px"></i>
            <div>
              <div style="font-weight:600">跨天车次</div>
              <div class="field-hint">始发 ${esc(departTime())} 晚于终到 ${esc(arriveTime())}，次日才到达。若想查看前一晚的发车班次，请把日期改为前一天。</div>
            </div>
          </div>
        </div>` : ''}
      </div>
    </div>
  `

  panel.querySelector('#btn-locate')?.addEventListener('click', () => navigate('train-locate', { train: state.train }))
  panel.querySelector('#btn-linemap')?.addEventListener('click', () => navigate('line-map', { train: state.train }))
  panel.querySelector('#btn-export')?.addEventListener('click', async () => {
    const text = list.map(s => `${s.station_name}\t到达 ${s.arrive_time || '—'}\t出发 ${s.depart_time || '—'}`).join('\n')
    const { copyText } = await import('../js/util.js')
    const ok = await copyText(`${state.train} 时刻表 (${state.date})\n${text}`)
    ok ? toast('已复制到剪贴板', { icon: 'success' }) : toastError('复制失败')
  })
}

function typeOfTrain(train) {
  const m = /^([A-Z]+)/.exec(String(train || ''))
  return m ? m[1] : ''
}

// ---------------------------------------------------------------------------
// 标签页二：运行
// ---------------------------------------------------------------------------

function paintRun(panel) {
  const hasAmapKey = !!getKey('amap')
  const p = position()
  const loc = state.locate
  const mapUrl = staticMapUrl('900*520')
  const locUrl = locateMapUrl()

  panel.innerHTML = `
    <div class="detail-side" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px;align-items:start">
      <div class="card">
        <div class="card-title" style="display:flex;align-items:center;gap:10px">
          <i class="fas fa-location-dot" style="color:var(--theme)"></i>
          <span>列车实时位置</span>
          ${state.polling ? '<span class="tag-pill green" style="margin-left:auto"><span class="pulse-dot" style="display:inline-block;margin-right:6px;vertical-align:middle"></span>实时</span>' : ''}
        </div>
        ${!loc ? `<div class="empty-state" style="padding:34px 10px">
            <i class="fas fa-train empty-icon"></i>
            <div class="empty-text">列车尚未发车或已到达终点，暂无实时位置</div>
          </div>` : `
          <table class="data-table">
            <tbody>
              <tr><td class="text-secondary" style="width:96px">状态</td><td>${esc(statusText())}</td></tr>
              <tr><td class="text-secondary">进度</td><td>${esc(loc.progress || '—')}</td></tr>
              ${loc.station ? `<tr><td class="text-secondary">最近车站</td><td>${esc(loc.station)}</td></tr>` : ''}
              ${loc.segment ? `<tr><td class="text-secondary">本段区间</td><td class="mono">${esc(loc.segment.depart_time || '')} - ${esc(loc.segment.arrive_time || '')}</td></tr>` : ''}
              ${positionText() ? `<tr><td class="text-secondary">坐标</td><td class="mono">${esc(positionText())}</td></tr>` : ''}
              ${loc.time ? `<tr><td class="text-secondary">更新时间</td><td class="mono">${esc(loc.time)}</td></tr>` : ''}
            </tbody>
          </table>
          ${locUrl ? `<img class="static-map" src="${esc(locUrl)}" alt="实时位置" />` : ''}
        `}
        ${!hasAmapKey ? `<div class="field-hint" style="margin-top:10px;color:var(--orange)">
          <i class="fas fa-info-circle"></i> 未配置高德 Web 服务密钥，地图无法显示（设置 → 接口密钥）</div>` : ''}
      </div>

      <div class="card">
        <div class="card-title" style="display:flex;align-items:center;gap:10px">
          <i class="fas fa-route" style="color:var(--theme)"></i>
          <span>运行线路</span>
          ${stationNames().length ? `<span class="tag-pill gray" style="margin-left:auto">共 ${stationNames().length} 站</span>` : ''}
        </div>
        ${!state.line ? `<div class="empty-state" style="padding:34px 10px">
            <i class="fas fa-route empty-icon"></i>
            <div class="empty-text">未获取到线路数据</div>
          </div>` : mapUrl ? `
          <img class="static-map" src="${esc(mapUrl)}" alt="运行线路" />
          <div style="display:flex;align-items:center;gap:16px;margin-top:10px;font-size:12px;color:var(--secondary)">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#007aff;margin-right:6px"></span>途经车站</span>
            <span><span style="display:inline-block;width:16px;height:3px;border-radius:2px;background:#007aff;margin-right:6px;vertical-align:middle"></span>运行路径</span>
          </div>
        ` : '<div class="field-hint">线路数据不足以绘制地图</div>'}
      </div>
    </div>

    ${stationNames().length ? `<div class="card" style="margin-top:16px">
      <div class="card-title">途经车站</div>
      <div class="line-chips">
        ${stationNames().map((n, i) => `<span class="line-chip"><span class="line-chip-dot" style="background:var(--theme)"></span>${i + 1}. ${esc(n)}</span>`).join('')}
      </div>
    </div>` : ''}
  `
}

// ---------------------------------------------------------------------------
// 标签页三：列车
// ---------------------------------------------------------------------------

function paintTrain(panel) {
  if (state.loading && !state.trainSet) {
    panel.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在获取车组信息…</span></div>`
    return
  }

  if (!state.trainSet && !state.trainSetTrains.length) {
    panel.innerHTML = `<div class="empty-state">
      <i class="fas fa-subway empty-icon"></i>
      <div class="empty-text">未查询到该车次的担当车组资料</div>
      <div class="field-hint">该车次可能尚未编组或无公开担当数据</div>
    </div>`
    return
  }

  const diagrams = state.carDiagrams
    .map((url, i) => ({ url, i }))
    .filter(d => !state.carDiagramBroken[d.i])

  const infoRows = (state.carInfo || []).map(it => `
    <div class="car-info-item">
      ${it.pictureUrl ? `<img class="car-info-icon" src="${esc(cateringImageUrl(it.pictureUrl))}" alt="${esc(it.pictureName)}" />` : ''}
      <div class="car-info-name">${esc(it.pictureName || '')}</div>
      <div class="car-info-value">${esc(it.pictureValue || '—')}</div>
    </div>
  `).join('')

  const trainRows = state.trainSetTrains.map(r => {
    const cur = r.train === state.train
    const t = typeOfTrain(r.train)
    return `<div class="record-row ${cur ? '' : 'clickable'}" ${cur ? '' : `data-train="${esc(r.train)}"`}
      style="${cur ? 'border-color:var(--theme);background:var(--theme-soft)' : 'cursor:pointer'}">
      <span class="record-value" style="font-size:16px">${esc(r.train)}</span>
      ${cur ? '<span class="tag-pill blue">当前</span>' : (t ? `<span class="field-hint">${esc(t)} 次</span>` : '')}
      ${r.date ? `<span class="field-hint" style="margin-left:auto">${esc(r.date)}</span>` : ''}
      ${cur ? '' : '<i class="fas fa-chevron-right" style="color:var(--secondary);margin-left:auto"></i>'}
    </div>`
  }).join('')

  panel.innerHTML = `
    <div class="detail-2col">
      <div>
        <div class="card">
          <div class="card-title" style="display:flex;align-items:center;gap:10px">
            <i class="fas fa-subway" style="color:var(--theme)"></i>
            <span>担当车组</span>
          </div>
          ${!state.trainSet ? '<div class="field-hint">未查到该车次的担当车组</div>' : `
            <div class="record-row clickable" data-emu="${esc(state.trainSet)}" style="cursor:pointer;padding:14px">
              <div style="flex:1">
                <div class="mono" style="font-size:20px;font-weight:700">${esc(state.trainSet)}</div>
                <div class="field-hint">${esc(emuModel())} · 点击查看该车组的全部运用车次</div>
              </div>
              <i class="fas fa-chevron-right" style="color:var(--secondary)"></i>
            </div>`}
        </div>

        ${state.trainSet ? `<div class="card">
          <div class="card-title" style="display:flex;align-items:center;gap:10px">
            <i class="fas fa-circle-info" style="color:var(--theme)"></i>
            <span>${esc(emuModel())} 列车信息</span>
            ${state.carInfoLoading ? '<span class="text-small text-secondary" style="margin-left:auto"><i class="fas fa-sync-alt fa-spin"></i> 加载中…</span>' : ''}
          </div>
          ${!state.carInfoLoading && !state.carInfo.length
            ? '<div class="field-hint">暂无该车型的资料</div>'
            : `<div class="car-info-grid">${infoRows}</div>`}
        </div>` : ''}

        ${state.trainSet && diagrams.length ? `<div class="card">
          <div class="card-title" style="display:flex;align-items:center;gap:10px">
            <i class="fas fa-train-subway" style="color:var(--theme)"></i>
            <span>车厢图</span>
            <span class="tag-pill gray" style="margin-left:auto">${state.formation ? state.formation + ' 编组 · ' : ''}点击放大</span>
          </div>
          <div class="car-scroll">
            ${diagrams.map(d => `<img class="car-diagram" data-idx="${d.i}" data-url="${esc(d.url)}" src="${esc(d.url)}" alt="车厢图 ${d.i + 1}" />`).join('')}
          </div>
        </div>` : ''}
      </div>

      <div class="detail-side">
        ${state.trainSet ? `<div class="card">
          <div class="card-title" style="display:flex;align-items:center;gap:10px">
            <i class="fas fa-image" style="color:var(--theme)"></i>
            <span>列车外观</span>
          </div>
          ${!state.carPic || state.carPicFailed
            ? '<div class="field-hint">暂无列车大图</div>'
            : `<img class="car-pic" src="${esc(state.carPic)}" alt="列车外观" />`}
        </div>` : ''}

        <div class="card">
          <div class="card-title" style="display:flex;align-items:center;gap:10px">
            <i class="fas fa-list" style="color:var(--theme)"></i>
            <span>${esc(state.trainSet || '车组')} 担当车次</span>
            ${state.trainSetTrains.length ? `<span class="tag-pill gray" style="margin-left:auto">共 ${state.trainSetTrains.length} 趟</span>` : ''}
          </div>
          ${!state.trainSetTrains.length
            ? '<div class="field-hint">未查到该车组担当的其他车次</div>'
            : `<div style="max-height:420px;overflow:auto">${trainRows}</div>`}
        </div>
      </div>
    </div>
  `

  panel.querySelector('[data-emu]')?.addEventListener('click', () => {
    navigate('emu-query', { mode: 'emu', q: state.trainSet })
  })
  panel.querySelectorAll('[data-train]').forEach(el => {
    el.addEventListener('click', () => loadTrain(el.dataset.train))
  })

  const pic = panel.querySelector('.car-pic')
  if (pic) pic.addEventListener('error', () => { state.carPicFailed = true; if (hostRef) paintPanel() })
  if (pic) pic.addEventListener('click', () => openImage(pic.src, [pic.src]))

  panel.querySelectorAll('.car-diagram').forEach(el => {
    el.addEventListener('error', () => {
      state.carDiagramBroken = Object.assign({}, state.carDiagramBroken, { [el.dataset.idx]: true })
      if (hostRef) paintPanel()
    })
    el.addEventListener('click', () => {
      const urls = [...panel.querySelectorAll('.car-diagram')].map(x => x.dataset.url)
      openImage(el.dataset.url, urls)
    })
  })
}

/** 图片放大查看（用遮罩层，不依赖系统图片查看器） */
async function openImage(current, urls) {
  const { modal } = await import('../js/ui.js')
  const list = urls && urls.length ? urls : [current]
  modal({
    title: '列车图片',
    wide: true,
    body: `<div style="display:flex;flex-direction:column;gap:12px;align-items:center">
      <img src="${esc(current)}" style="max-width:100%;border-radius:10px" alt="预览" />
      ${list.length > 1 ? `<div class="text-small text-secondary">共 ${list.length} 张车厢图</div>` : ''}
    </div>`,
    buttons: [{ text: '关闭', primary: true, value: true }]
  })
}

// ---------------------------------------------------------------------------
// 数据加载
// ---------------------------------------------------------------------------

function reset() {
  state.timetable = null
  state.platformMap = {}
  state.platformLoading = false
  state.line = null
  state.locate = null
  state.trainSet = ''
  state.trainSetTrains = []
  state.carInfo = []
  state.carDiagrams = []
  state.formation = 0
  state.carPic = ''
  state.carInfoLoading = false
  state.carPicFailed = false
  state.carDiagramBroken = {}
}

async function loadTrain(trainNo) {
  stopPolling()
  const no = String(trainNo || '').trim().toUpperCase()
  state.train = no
  state.loading = true
  reset()
  addSearchHistory(no)
  const token = ++loadToken

  const inputEl = host && host.querySelector('#f-train')
  if (inputEl && inputEl.value.toUpperCase() !== no) inputEl.value = no
  state.activeTab = 'time'
  paintHero()
  paintPanel()

  // 分步渲染：哪个接口先回就先显示哪块，不阻塞首屏
  const onPartial = (patch) => {
    if (token !== loadToken) return
    if (patch.timetable) {
      state.timetable = patch.timetable
      state.loading = false
      askDepartDate(patch.timetable)
    }
    if (patch.line) state.line = patch.line
    if (patch.locate) {
      state.locate = patch.locate
      if (isRunning()) startPolling()
    }
    if (patch.trainSet) {
      state.trainSet = patch.trainSet
      loadCarInfo(token)
    }
    paintHero()
    paintPanel()
  }

  try {
    const res = await getTrainDetail(no, state.date, onPartial)
    if (token !== loadToken) return
    state.timetable = res.timetable || state.timetable
    state.line = res.line || state.line
    state.locate = res.locate || state.locate
    state.trainSet = res.trainSet || state.trainSet
    state.trainSetTrains = res.trainSetTrains || []
    if (!res.timetable && !res.line && !res.locate && !res.trainSet) {
      toastError('未查询到该车次')
    }
    if (isRunning()) startPolling()
  } catch (e) {
    if (token === loadToken) toastError(apiErrMsg(e))
  } finally {
    if (token === loadToken) state.loading = false
  }

  if (token !== loadToken) return
  paintHero()
  paintPanel()
  if (state.trainSet) loadCarInfo(token)
  loadPlatforms(token)
}

/**
 * 跨天车次查询后提示发车日。
 * 跨天车（始发晚于终到）在查询日次日才到站，「昨天发车」那趟此刻可能仍在跑，
 * 必须让用户明确选一班。只在本次查询尚未确认过时提示一次。
 */
async function askDepartDate(tt) {
  if (!tt || !hostRef) return
  const dep = toMinutes(tt.depart_time)
  const arr = toMinutes(tt.arrive_time)
  if (dep === null || arr === null || dep <= arr) return
  const key = state.train + state.date
  if (departAsked === key) return
  departAsked = key

  const { modal } = await import('../js/ui.js')
  const base = state.date || today()
  const y = dateMinus(base, 1)
  const idx = await modal({
    title: `${state.train} 是跨天车次，请选择发车日`,
    body: `<div style="font-size:13px;color:var(--secondary);margin-bottom:14px">
        该车次始发 ${esc(tt.depart_time)}、次日 ${esc(tt.arrive_time)} 到达，请确认要查看哪一天的发车班次。</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-ghost" data-pick="0" style="justify-content:flex-start">${esc(y)} 发车</button>
        <button class="btn btn-ghost" data-pick="1" style="justify-content:flex-start">${esc(base)} 发车</button>
      </div>`,
    buttons: [{ text: '取消', value: -1 }],
    onMount(bodyEl, close) {
      bodyEl.querySelectorAll('[data-pick]').forEach(b => {
        b.addEventListener('click', () => close(b.dataset.pick === '0' ? -1 : 1))
      })
    }
  })
  if (idx !== 0 && idx !== 1) return
  if (idx === 0) {
    state.date = y
    const dateEl = host && host.querySelector('#f-date')
    if (dateEl) dateEl.value = y
    loadTrain(state.train)
  }
}

async function loadPlatforms(token) {
  const list = stops()
  if (!list.length) return
  state.platformLoading = true
  paintPanel()
  try {
    const map = await getPlatformMap(state.train, list)
    if (token === loadToken && map && Object.keys(map).length) state.platformMap = map
  } catch (e) {
    // 停台属于附加信息，失败不打扰用户
  } finally {
    if (token === loadToken) {
      state.platformLoading = false
      paintPanel()
    }
  }
}

async function loadCarInfo(token) {
  if (!state.trainSet) return
  state.carInfoLoading = true
  try {
    const res = await getTrainSetInfo(state.trainSet)
    if (token !== loadToken) return
    state.carInfo = res.info || []
    state.carDiagrams = res.diagrams || []
    state.formation = res.formation || 0
    state.carPic = res.carPic || carPicUrl(state.trainSet)
  } catch (e) {
    state.carInfo = []
    state.carDiagrams = []
  } finally {
    if (token === loadToken) {
      state.carInfoLoading = false
      paintPanel()
    }
  }
}

function startPolling() {
  stopPolling()
  state.polling = true
  pollTimer = setInterval(async () => {
    try {
      const res = await getTrainLocate(state.train)
      if (res && res.code === 0 && res.data) {
        state.locate = res.data
        if (res.data.status !== 'running') stopPolling()
        if (hostRef) { paintHero(); paintPanel() }
      }
    } catch (e) { /* 轮询失败静默 */ }
  }, POLL_MS)
}

function stopPolling() {
  state.polling = false
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

registerView('train-detail', {
  title: '车次详情',
  subtitle: '时刻、运行位置与担当车组',
  icon: 'fa-train',
  color: '#007aff',
  hidden: false,
  render,
  onEnter(params) {
    if (params && params.train) {
      state.date = params.date || state.date || today()
      state.train = ''
      loadTrain(params.train)
    }
  },
  destroy() {
    stopPolling()
    loadToken++
    hostRef = null
    host = null
  }
})
