/**
 * RailKale: Next PC - 车次查询
 * 输入出发/到达站中文名查询车次列表，并展示各席别余票
 */

import { registerView, navigate } from '../js/router.js'
import { getTrains, getLeftTickets } from '../js/api.js'
import { getName, resolveTelecode } from '../js/station.js'
import { today, dateOffset, escapeHTML, fixed, apiErrMsg } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

const SEAT_TYPES = [
  { key: 'businessSeat', name: '商务座' },
  { key: 'premiumFirstClass', name: '优选一等座' },
  { key: 'firstClass', name: '一等座' },
  { key: 'secondClass', name: '二等座' },
  { key: 'advancedSleeper', name: '高级软卧' },
  { key: 'softSleeper', name: '软卧' },
  { key: 'hardSleeper', name: '硬卧' },
  { key: 'softSeat', name: '软座' },
  { key: 'hardSeat', name: '硬座' },
  { key: 'noSeat', name: '无座' },
  { key: 'other', name: '其他' }
]

const QUICK_STATIONS = ['北京南', '上海虹桥', '广州南', '深圳北', '杭州东', '成都东', '武汉', '南京南', '西安北', '重庆西']

let state = {
  from: '',
  to: '',
  date: today(),
  searched: false,
  result: {},
  trains: [],
  seatMap: {},
  loading: false
}

function esc(s) { return escapeHTML(s) }

function seatChips(train) {
  const key = `${train.trainNo}|${train.fromTime}|${train.toTime}`
  const seats = state.seatMap[key]
  if (!seats) return ''
  const chips = []
  for (const st of SEAT_TYPES) {
    const val = seats[st.key]
    if (val != null && val !== '--' && val !== '') {
      chips.push(`<div class="seat-chip"><span class="seat-name">${esc(st.name)}</span><span class="seat-value">${esc(val)}</span></div>`)
    }
    if (chips.length >= 8) break
  }
  return chips.length ? `<div class="seat-row">${chips.join('')}</div>` : ''
}

function trainCard(t) {
  return `
    <div class="train-card" data-train="${esc(t.trainNo)}">
      <div class="train-card-head">
        <span class="train-no">${esc(t.trainNo)}</span>
        <span class="train-duration">${esc(t.duration || '')}</span>
      </div>
      <div class="train-route">
        <div class="train-station">
          <span class="station-badge origin">始</span>
          <span class="station-dot"></span>
          <span>${esc(t.fromStation)}</span>
        </div>
        <div class="train-route-line"></div>
        <div class="train-station">
          <span>${esc(t.toStation)}</span>
          <span class="station-dot arrival"></span>
          <span class="station-badge terminal">终</span>
        </div>
      </div>
      <div class="train-times">
        <span>${esc(t.fromTime)}</span><span class="sep">→</span><span>${esc(t.toTime)}</span>
      </div>
      ${seatChips(t)}
    </div>
  `
}

function render(host) {
  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:#007aff"><i class="fas fa-train"></i></div>
        <div>
          <div class="page-title">车次查询</div>
          <div class="page-subtitle">按出发 / 到达站与日期查询车次及余票</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="form-row">
        <div class="field">
          <label class="field-label">出发站</label>
          <input class="input" id="f-from" placeholder="如：北京南" value="${esc(state.from)}" />
        </div>
        <button class="btn btn-ghost" id="btn-swap" title="交换" style="height:40px"><i class="fas fa-sync-alt"></i></button>
        <div class="field">
          <label class="field-label">到达站</label>
          <input class="input" id="f-to" placeholder="如：上海虹桥" value="${esc(state.to)}" />
        </div>
        <div class="field narrow">
          <label class="field-label">日期</label>
          <input class="input" type="date" id="f-date" value="${esc(state.date)}" />
        </div>
        <button class="btn" id="btn-search" style="height:40px"><i class="fas fa-search"></i> 查询</button>
      </div>
      <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <span style="font-size:12px;color:var(--secondary);margin-right:2px">快捷日期</span>
        <button class="btn btn-ghost btn-sm" data-day="0">今天</button>
        <button class="btn btn-ghost btn-sm" data-day="1">明天</button>
        <button class="btn btn-ghost btn-sm" data-day="2">后天</button>
      </div>
    </div>

    <div class="card" id="quick-card">
      <div class="card-title">常用车站</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px" id="quick-tags">
        ${QUICK_STATIONS.map(s => `<button class="btn btn-ghost btn-sm" data-station="${esc(s)}">${esc(s)}</button>`).join('')}
      </div>
    </div>

    <div id="result-host"></div>
  `

  const fromEl = host.querySelector('#f-from')
  const toEl = host.querySelector('#f-to')
  const dateEl = host.querySelector('#f-date')
  const resultHost = host.querySelector('#result-host')

  const sync = () => {
    state.from = fromEl.value.trim()
    state.to = toEl.value.trim()
    state.date = dateEl.value
  }

  function paintResult() {
    if (!state.searched) { resultHost.innerHTML = ''; return }
    if (state.loading) {
      resultHost.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在查询车次…</span></div>`
      return
    }
    if (!state.trains.length) {
      resultHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-train empty-icon"></i>
        <div class="empty-text">未查询到车次信息</div>
      </div>`
      return
    }
    const r = state.result || {}
    resultHost.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin:20px 0 12px">
        <div style="font-size:16px;font-weight:700">${esc(r.from || state.from)} → ${esc(r.to || state.to)}</div>
        <div style="display:flex;align-items:center;gap:14px">
          <span class="text-small text-secondary">${esc(state.date)}</span>
          <span class="tag-pill blue">共 ${state.trains.length} 个车次</span>
          ${r.elapsed ? `<span class="text-small text-secondary">耗时 ${esc(r.elapsed)}</span>` : ''}
        </div>
      </div>
      <div class="train-list">${state.trains.map(trainCard).join('')}</div>
    `
    resultHost.querySelectorAll('.train-card').forEach(el => {
      el.addEventListener('click', () => {
        navigate('timetable', { train: el.dataset.train, date: state.date })
      })
    })
  }

  async function doSearch() {
    sync()
    if (!state.from) { toast('请输入出发站'); return }
    if (!state.to) { toast('请输入到达站'); return }

    state.loading = true
    state.searched = true
    state.trains = []
    state.seatMap = {}
    paintResult()
    host.querySelector('#quick-card').style.display = 'none'

    try {
      const res = await getTrains(state.from, state.to, state.date)
      if (res && res.success) {
        state.result = res
        const list = res.trains || []
        // 并行解析站名
        const resolved = await Promise.all(list.map(async (t) => ({
          ...t,
          fromStation: (await getName(t.fromStation).catch(() => null)) || t.fromStation,
          toStation: (await getName(t.toStation).catch(() => null)) || t.toStation
        })))
        state.trains = resolved
        state.loading = false
        paintResult()
        fetchLeftTickets()
      } else {
        state.loading = false
        state.trains = []
        paintResult()
        toastError((res && res.msg) || '查询失败')
      }
    } catch (e) {
      console.error(e)
      state.loading = false
      state.trains = []
      paintResult()
      toastError(apiErrMsg(e))
    }
  }

  async function fetchLeftTickets() {
    try {
      const [fromTc, toTc] = await Promise.all([
        resolveTelecode(state.from),
        resolveTelecode(state.to)
      ])
      if (!fromTc.telecode || !toTc.telecode) return
      const res = await getLeftTickets(fromTc.telecode, toTc.telecode, state.date)
      if (!res || !res.success || !Array.isArray(res.trains)) {
        if (res && res.message) console.warn('[余票] ' + res.message)
        return
      }
      const map = {}
      for (const t of res.trains) {
        if (!t.seats) continue
        map[`${t.trainNo}|${t.fromTime}|${t.toTime}`] = t.seats
      }
      state.seatMap = map
      paintResult()
    } catch (e) {
      console.warn('余票查询失败', e)
    }
  }

  host.querySelector('#btn-search').addEventListener('click', doSearch)
  host.querySelector('#btn-swap').addEventListener('click', () => {
    const tmp = fromEl.value
    fromEl.value = toEl.value
    toEl.value = tmp
    sync()
  })
  toEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch() })
  fromEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch() })

  host.querySelectorAll('[data-day]').forEach(b => {
    b.addEventListener('click', () => {
      dateEl.value = dateOffset(Number(b.dataset.day))
      sync()
    })
  })
  host.querySelectorAll('[data-station]').forEach(b => {
    b.addEventListener('click', () => {
      const name = b.dataset.station
      if (!fromEl.value) fromEl.value = name
      else if (!toEl.value) toEl.value = name
      else { fromEl.value = name; toEl.value = '' }
      sync()
    })
  })

  // 恢复历史状态
  if (state.searched) {
    host.querySelector('#quick-card').style.display = 'none'
    paintResult()
  }
}

registerView('train-query', {
  title: '车次查询',
  subtitle: '按出发 / 到达站与日期查询车次及余票',
  icon: 'fa-train',
  color: '#007aff',
  render
})
