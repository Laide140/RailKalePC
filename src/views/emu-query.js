/**
 * RailKale: Next PC - 运用担当
 * 按车次查车组 / 按车组查交路（数据源 rail.re）
 */

import { registerView } from '../js/router.js'
import { railReTrain, railReEmu } from '../js/api.js'
import { escapeHTML, today } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

let state = { mode: 'train', query: '', result: null, loading: false, error: '', searched: false }
let hostRef = null

function esc(s) { return escapeHTML(s) }

function render(host) {
  hostRef = host
  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:#af52de"><i class="fas fa-subway"></i></div>
        <div>
          <div class="page-title">运用担当</div>
          <div class="page-subtitle">按车次查车组，或按车组号查担当交路</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="tabs" style="max-width:340px">
        <div class="tab ${state.mode === 'train' ? 'active' : ''}" data-mode="train">按车次</div>
        <div class="tab ${state.mode === 'emu' ? 'active' : ''}" data-mode="emu">按车组号</div>
      </div>
      <div class="form-row">
        <div class="field">
          <label class="field-label">${state.mode === 'train' ? '车次号' : '车组号'}</label>
          <input class="input" id="f-query"
                 placeholder="${state.mode === 'train' ? '如：G1' : '如：CR400BFS-3157'}"
                 value="${esc(state.query)}" />
        </div>
        <button class="btn" id="btn-go" style="height:40px;background:#af52de"><i class="fas fa-search"></i> 查询</button>
      </div>
    </div>

    <div id="result-host"></div>
  `

  const input = host.querySelector('#f-query')
  const resultHost = host.querySelector('#result-host')

  const todayStr = today()

  function paint() {
    if (!state.searched) { resultHost.innerHTML = ''; return }
    if (state.loading) {
      resultHost.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>查询中…</span></div>`
      return
    }
    if (state.error) {
      resultHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-times-circle empty-icon" style="color:var(--red)"></i>
        <div class="empty-text">${esc(state.error)}</div>
      </div>`
      return
    }
    if (!state.result || !state.result.length) {
      resultHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-subway empty-icon"></i>
        <div class="empty-text">未查询到记录</div>
      </div>`
      return
    }

    const isTrain = state.mode === 'train'
    const rows = state.result.map(r => {
      const isToday = r.date && String(r.date).indexOf(todayStr) === 0
      return `
        <div class="record-row" style="${isToday ? 'border-color:var(--purple);background:rgba(175,82,222,.06)' : ''}">
          <span class="record-date">${esc(r.date || '—')}</span>
          ${isToday ? '<span class="tag-pill purple">今日</span>' : ''}
          <span class="record-value" style="margin-left:auto">
            ${esc(isTrain ? (r.emu_no || '—') : (r.train_no || '—'))}
          </span>
        </div>
      `
    }).join('')

    resultHost.innerHTML = `
      <div class="card" style="margin-top:18px">
        <div class="card-title">
          ${isTrain ? `车次 ${esc(state.query)} 的运用记录` : `车组 ${esc(state.query)} 的担当记录`}
          · 共 ${state.result.length} 条
        </div>
        <div>${rows}</div>
      </div>
    `
  }

  async function doSearch() {
    const q = input.value.trim().toUpperCase()
    if (!q) { toast('请输入查询内容'); return }
    state.query = q
    state.loading = true
    state.searched = true
    state.error = ''
    state.result = null
    paint()
    try {
      const data = state.mode === 'train' ? await railReTrain(q) : await railReEmu(q)
      state.result = Array.isArray(data) ? data : []
    } catch (e) {
      state.error = '查询失败：数据源返回异常'
      state.result = null
    }
    state.loading = false
    if (hostRef === host) paint()
  }

  host.querySelectorAll('[data-mode]').forEach(el => {
    el.addEventListener('click', () => {
      state.mode = el.dataset.mode
      state.result = null
      state.searched = false
      render(host)
    })
  })
  host.querySelector('#btn-go').addEventListener('click', doSearch)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch() })

  paint()
  if (state.searched) paint()
}

registerView('emu-query', {
  title: '运用担当',
  icon: 'fa-subway',
  color: '#af52de',
  render,
  destroy() { hostRef = null }
})
