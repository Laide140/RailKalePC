/**
 * RailKale: Next PC - 车站代码查询
 * 全国车站电报码 / 拼音 / 缩写 / 所属城市
 */

import { registerView } from '../js/router.js'
import { getStationList } from '../js/station.js'
import { escapeHTML, debounce, copyText } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

let state = { all: [], keyword: '', loading: false, loaded: false }
let hostRef = null

const PAGE_SIZE = 200

function esc(s) { return escapeHTML(s) }

function render(host) {
  hostRef = host
  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:#34c759"><i class="fas fa-building"></i></div>
        <div>
          <div class="page-title">车站代码</div>
          <div class="page-subtitle">全国车站电报码、拼音、缩写与所属城市</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="tag-pill" id="count-badge">—</span>
        <button class="btn btn-ghost btn-sm" id="btn-reload"><i class="fas fa-sync-alt"></i> 重新加载</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="form-row">
        <div class="field" style="flex:1">
          <input class="input" id="f-search" placeholder="搜索车站名称 / 电报码 / 拼音 / 缩写 / 城市" value="${esc(state.keyword)}" />
        </div>
      </div>
    </div>

    <div id="list-host"></div>
  `

  const searchEl = host.querySelector('#f-search')
  const listHost = host.querySelector('#list-host')
  const countBadge = host.querySelector('#count-badge')

  function filtered() {
    const kw = state.keyword.trim().toLowerCase()
    if (!kw) return state.all
    return state.all.filter(s =>
      s.name.toLowerCase().includes(kw) ||
      s.pinyin.toLowerCase().includes(kw) ||
      s.telecode.toLowerCase().includes(kw) ||
      s.abbr.toLowerCase().includes(kw) ||
      s.city.toLowerCase().includes(kw)
    )
  }

  function paint() {
    if (state.loading) {
      listHost.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在加载车站代码表…</span></div>`
      countBadge.textContent = '加载中'
      return
    }
    const list = filtered()
    countBadge.textContent = `共 ${list.length} 个车站`

    if (!list.length) {
      listHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-building empty-icon"></i>
        <div class="empty-text">${state.keyword ? '未找到匹配的车站' : '暂无数据'}</div>
      </div>`
      return
    }

    const shown = list.slice(0, PAGE_SIZE)
    const rows = shown.map(s => `
      <tr>
        <td><b>${esc(s.name)}</b></td>
        <td class="text-secondary mono">${esc(s.pinyin)}</td>
        <td><span class="code-badge">${esc(s.telecode)}</span></td>
        <td class="text-secondary mono">${esc(s.abbr)}</td>
        <td class="text-secondary">${esc(s.city)}</td>
        <td style="text-align:right">
          <button class="btn btn-ghost btn-sm" data-copy="${esc(s.telecode)}" title="复制电报码">
            <i class="fas fa-copy"></i>
          </button>
        </td>
      </tr>
    `).join('')

    listHost.innerHTML = `
      <div class="code-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>车站名</th><th>拼音</th><th>电报码</th><th>缩写</th><th>所属城市</th><th style="width:70px"></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${list.length > PAGE_SIZE
        ? `<div style="text-align:center;padding:14px;font-size:12.5px;color:var(--secondary)">
             仅显示前 ${PAGE_SIZE} 条，请输入关键字缩小范围
           </div>`
        : ''}
    `

    listHost.querySelectorAll('[data-copy]').forEach(b => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation()
        const ok = await copyText(b.dataset.copy)
        ok ? toast('已复制 ' + b.dataset.copy, { icon: 'success' }) : toastError('复制失败')
      })
    })
  }

  async function load(force) {
    if (!force && state.loaded) { paint(); return }
    state.loading = true
    paint()
    try {
      state.all = await getStationList()
      state.loaded = true
    } catch (e) {
      toastError('加载失败：' + (e.message || e))
      state.all = []
    }
    state.loading = false
    if (hostRef === host) paint()
  }

  const onInput = debounce(() => {
    state.keyword = searchEl.value
    paint()
  }, 180)
  searchEl.addEventListener('input', onInput)

  host.querySelector('#btn-reload').addEventListener('click', () => load(true))

  load(false)
}

registerView('station-code', {
  title: '车站代码',
  icon: 'fa-building',
  color: '#34c759',
  render,
  destroy() { hostRef = null }
})
