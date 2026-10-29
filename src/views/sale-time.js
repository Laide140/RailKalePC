/**
 * RailKale: Next PC - 车站开售时间
 * 移植自移动端 pages/sale-time
 *
 * 接口返回全部车站（约 3149 条 / 800KB），本地缓存一周。
 * 桌面端：表格化 + 全字段搜索 + 按路局筛选 + 按时间排序，
 * 并对超长列表做分批渲染（先出 300 行，滚动到底继续追加）。
 */

import { registerView } from '../js/router.js'
import {
  getStationSaleTimeInfo, formatSaleTime, bureauName, bureauShortName,
  isRenamedStation, BUREAU_NAMES
} from '../js/api.js'
import { cacheGet, cacheSet } from '../js/settings.js'
import { escapeHTML, copyText, debounce } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

const CACHE_KEY = 'station-sale-time'
const CACHE_TTL = 7 * 24 * 3600 * 1000   // 开售时间变动不频繁，缓存一周
const PAGE = 300

let state = {
  list: [],
  loading: false,
  error: '',
  keyword: '',
  bureau: '',        // '' 表示全部
  sort: 'time',      // 'time' | 'name' | 'bureau'
  renamedOnly: false,
  limit: PAGE
}

let hostRef = null
// 防止「加载失败 → 重绘 → 再次自动加载」的无限递归
let loadingPromise = null

function esc(s) { return escapeHTML(s) }

function readCache() {
  const d = cacheGet(CACHE_KEY)
  if (!d || !Array.isArray(d.list) || !d.list.length) return null
  if (d.ts && Date.now() - d.ts > CACHE_TTL) return null
  return d.list
}

function writeCache(list) {
  cacheSet(CACHE_KEY, { ts: Date.now(), list })
}

/** 当前筛选后的列表 */
function filtered() {
  const kw = state.keyword.trim()
  const kwUp = kw.toUpperCase()
  const out = []
  for (const s of state.list) {
    if (state.renamedOnly && !isRenamedStation(s)) continue
    if (state.bureau && String(s.bureau_code || '').toUpperCase() !== state.bureau) continue
    if (kw) {
      const name = String(s.station_name || '')
      const code = String(s.station_telecode || '').toUpperCase()
      const bur = bureauShortName(s.bureau_code) + bureauName(s.bureau_code)
      if (name.indexOf(kw) < 0 && code.indexOf(kwUp) < 0 && bur.toUpperCase().indexOf(kwUp) < 0) continue
    }
    out.push(s)
  }
  const cmp = {
    time: (a, b) => String(a.sale_time || '').localeCompare(String(b.sale_time || '')) || String(a.station_name || '').localeCompare(String(b.station_name || ''), 'zh'),
    name: (a, b) => String(a.station_name || '').localeCompare(String(b.station_name || ''), 'zh'),
    bureau: (a, b) => String(a.bureau_code || '').localeCompare(String(b.bureau_code || '')) || String(a.station_name || '').localeCompare(String(b.station_name || ''), 'zh')
  }[state.sort] || (() => 0)
  return out.sort(cmp)
}

function render(host) {
  hostRef = host

  const bureaus = collectBureaus()

  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:var(--theme)"><i class="fas fa-clock"></i></div>
        <div>
          <div class="page-title">车站开售时间</div>
          <div class="page-subtitle">全国车站每日起售时间查询，支持按路局筛选</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="tag-pill gray" id="count-badge">—</span>
        <button class="btn btn-ghost btn-sm" id="btn-reload"><i class="fas fa-sync-alt"></i> 刷新数据</button>
      </div>
    </div>

    <div class="card">
      <div class="table-toolbar">
        <div style="position:relative;flex:1;min-width:220px;max-width:380px">
          <i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--secondary);font-size:13px"></i>
          <input class="input" id="f-kw" placeholder="搜索车站名 / 电报码 / 路局" style="padding-left:34px" value="${esc(state.keyword)}" />
        </div>
        <select class="select" id="f-bureau" style="width:180px">
          <option value="">全部路局</option>
          ${bureaus.map(b => `<option value="${esc(b.code)}" ${state.bureau === b.code ? 'selected' : ''}>${esc(b.name)}（${b.count}）</option>`).join('')}
        </select>
        <select class="select" id="f-sort" style="width:150px">
          <option value="time" ${state.sort === 'time' ? 'selected' : ''}>按开售时间</option>
          <option value="name" ${state.sort === 'name' ? 'selected' : ''}>按车站名</option>
          <option value="bureau" ${state.sort === 'bureau' ? 'selected' : ''}>按路局</option>
        </select>
        <label style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--secondary);cursor:pointer">
          <input type="checkbox" id="f-renamed" ${state.renamedOnly ? 'checked' : ''} style="accent-color:var(--theme)" />
          只看已改名
        </label>
        <button class="btn btn-ghost btn-sm" id="btn-copy" style="margin-left:auto"><i class="fas fa-copy"></i> 复制结果</button>
      </div>

      <div id="table-host"></div>
    </div>
  `

  const kwEl = host.querySelector('#f-kw')
  const bureauEl = host.querySelector('#f-bureau')
  const sortEl = host.querySelector('#f-sort')
  const renamedEl = host.querySelector('#f-renamed')
  const tableHost = host.querySelector('#table-host')

  function paintTable() {
    if (state.loading && !state.list.length) {
      tableHost.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在获取车站开售时间…</span></div>`
      return
    }
    if (state.error && !state.list.length) {
      tableHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-times-circle empty-icon" style="color:var(--red)"></i>
        <div class="empty-text">${esc(state.error)}</div>
        <button class="btn btn-sm" id="btn-retry">点击重试</button>
      </div>`
      tableHost.querySelector('#btn-retry').addEventListener('click', () => load(true))
      return
    }

    const all = filtered()
    const shown = all.slice(0, state.limit)
    const badge = host.querySelector('#count-badge')
    if (badge) {
      badge.textContent = state.keyword || state.bureau || state.renamedOnly
        ? `${all.length} / ${state.list.length} 个车站`
        : `共 ${state.list.length} 个车站`
    }

    if (!all.length) {
      tableHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-search empty-icon"></i>
        <div class="empty-text">没有匹配「${esc(state.keyword || bureauName(state.bureau) || '已改名')}」的车站</div>
      </div>`
      return
    }

    const rows = shown.map(s => {
      const renamed = isRenamedStation(s)
      const short = bureauShortName(s.bureau_code)
      return `<tr>
        <td style="font-weight:600">${esc(s.station_name || '—')}</td>
        <td class="mono text-secondary">${esc(s.station_telecode || '—')}</td>
        <td><span class="sale-time-cell">${esc(formatSaleTime(s.sale_time))}</span></td>
        <td>${renamed ? '<span class="sale-renamed">已改名</span>' : esc(short || bureauName(s.bureau_code) || '—')}</td>
      </tr>`
    }).join('')

    tableHost.innerHTML = `
      <div class="table-scroll" id="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th data-sort="name" style="cursor:pointer">车站 ${state.sort === 'name' ? '↑' : ''}</th>
              <th style="width:120px">电报码</th>
              <th data-sort="time" style="width:130px;cursor:pointer">开售时间 ${state.sort === 'time' ? '↑' : ''}</th>
              <th data-sort="bureau" style="width:160px;cursor:pointer">路局 ${state.sort === 'bureau' ? '↑' : ''}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;gap:12px;flex-wrap:wrap">
        <span class="text-small text-secondary">
          显示 ${shown.length} / ${all.length} 条${all.length > shown.length ? ' · 滚动到底部继续加载' : ''}
        </span>
        <span class="text-small text-secondary">「已改名」指该站已更名，原站名不再对应有效车站</span>
      </div>
    `

    const scrollEl = tableHost.querySelector('#table-scroll')
    scrollEl.addEventListener('scroll', () => {
      if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 80) {
        if (state.limit < all.length) {
          state.limit += PAGE
          const keep = scrollEl.scrollTop
          paintTable()
          const again = tableHost.querySelector('#table-scroll')
          if (again) again.scrollTop = keep
        }
      }
    })
    tableHost.querySelectorAll('[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const v = th.dataset.sort
        state.sort = state.sort === v ? (v === 'time' ? 'name' : 'time') : v
        sortEl.value = state.sort
        state.limit = PAGE
        paintTable()
      })
    })
  }

  const refresh = () => { state.limit = PAGE; paintTable() }

  kwEl.addEventListener('input', debounce(() => { state.keyword = kwEl.value; refresh() }, 180))
  bureauEl.addEventListener('change', () => { state.bureau = bureauEl.value; refresh() })
  sortEl.addEventListener('change', () => { state.sort = sortEl.value; refresh() })
  renamedEl.addEventListener('change', () => { state.renamedOnly = renamedEl.checked; refresh() })

  host.querySelector('#btn-copy').addEventListener('click', async () => {
    const all = filtered()
    if (!all.length) { toast('没有可复制的内容'); return }
    const text = all.map(s => `${s.station_name}\t${s.station_telecode || ''}\t${formatSaleTime(s.sale_time)}\t${isRenamedStation(s) ? '已改名' : bureauName(s.bureau_code)}`).join('\n')
    const ok = await copyText(`车站\t电报码\t开售时间\t路局\n${text}`)
    ok ? toast(`已复制 ${all.length} 条记录`, { icon: 'success' }) : toastError('复制失败')
  })

  host.querySelector('#btn-reload').addEventListener('click', () => load(true))

  if (!state.list.length && !state.loading && !state.error && !loadingPromise) load(false)
  else paintTable()
}

function collectBureaus() {
  const map = {}
  for (const s of state.list) {
    if (isRenamedStation(s)) continue
    const c = String(s.bureau_code || '').trim().toUpperCase()
    if (!c) continue
    if (!map[c]) map[c] = { code: c, name: bureauName(c) || c, count: 0 }
    map[c].count++
  }
  return Object.values(map).sort((a, b) => b.count - a.count)
}

async function load(force) {
  if (loadingPromise) return loadingPromise
  if (!force) {
    const cached = readCache()
    if (cached) {
      state.list = cached
      state.loading = false
      refreshHost()
      return
    }
  }

  state.loading = true
  state.error = ''
  if (hostRef) refreshHost()
  loadingPromise = (async () => {
    try {
      const res = await getStationSaleTimeInfo()
      const arr = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : [])
      if (!arr.length) {
        state.error = '未获取到开售时间数据'
      } else {
        state.list = arr
        writeCache(arr)
      }
    } catch (e) {
      state.error = '网络异常，请稍后重试'
    } finally {
      state.loading = false
      loadingPromise = null
    }
    refreshHost()
  })()
  return loadingPromise
}

function refreshHost() {
  if (hostRef && hostRef.isConnected) render(hostRef)
}

registerView('sale-time', {
  title: '开售时间',
  subtitle: '全国车站每日起售时间查询',
  icon: 'fa-clock',
  color: '#5ac8fa',
  render,
  destroy() { hostRef = null }
})
