/**
 * RailKale: Next PC - 运用担当
 * 按车次查担当车组 / 按车组查该车组担当的全部车次
 * 数据来自自有数据源 /api/v3/emu，支持按日期查询
 */

import { registerView, navigate } from '../js/router.js'
import { getTrainData, todayStr } from '../js/api.js'
import { escapeHTML, dateOffset } from '../js/util.js'
import { toast } from '../js/ui.js'

let state = {
  mode: 'train',            // 'train' | 'emu'
  query: '',
  date: todayStr(),
  loading: false,
  single: null,             // 按车次查：{ train, trainSet, date }
  list: [],                 // 按车组查：[{ train, trainSet, date }]
  // 已执行查询的快照：结果区只依据它渲染，
  // 编辑输入框或切换类型时不会让已有结果跟着变
  searched: { query: '', mode: '', date: '' }
}

let hostRef = null

function esc(s) { return escapeHTML(s) }

/** 车次首字母即车次类型（G/D/C…），接口已不再返回 type 字段 */
function typeOf(train) {
  const m = /^([A-Z]+)/.exec(String(train || ''))
  return m ? m[1] : ''
}

function shortDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '')
  if (!m) return d || '选择日期'
  return Number(m[1]) === new Date().getFullYear() ? `${+m[2]}月${+m[3]}日` : `${m[1]}-${m[2]}-${m[3]}`
}

function render(host) {
  hostRef = host
  const isTrain = state.mode === 'train'

  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:var(--theme)"><i class="fas fa-subway"></i></div>
        <div>
          <div class="page-title">运用担当</div>
          <div class="page-subtitle">按车次查担当车组，或按车组号查该车组担当的全部车次</div>
        </div>
      </div>
      <span class="tag-pill gray" title="数据来自自有数据源">自有数据源</span>
    </div>

    <div class="card">
      <div class="tabs" style="max-width:320px">
        <div class="tab ${isTrain ? 'active' : ''}" data-mode="train"><i class="fas fa-train"></i> 按车次</div>
        <div class="tab ${!isTrain ? 'active' : ''}" data-mode="emu"><i class="fas fa-subway"></i> 按车组号</div>
      </div>
      <div class="form-row">
        <div class="field">
          <label class="field-label">${isTrain ? '车次号' : '车组号'}</label>
          <input class="input" id="f-query"
                 placeholder="${isTrain ? '如：G1' : '如：CR400BF-A-5054'}"
                 value="${esc(state.query)}" />
        </div>
        <div class="field narrow">
          <label class="field-label">日期</label>
          <input class="input" type="date" id="f-date" value="${esc(state.date)}" />
        </div>
        <button class="btn" id="btn-go" style="height:40px"><i class="fas fa-search"></i> 查询</button>
      </div>
      <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <span style="font-size:12px;color:var(--secondary);margin-right:2px">快捷日期</span>
        <button class="btn btn-ghost btn-sm" data-day="0">今天</button>
        <button class="btn btn-ghost btn-sm" data-day="1">明天</button>
        <button class="btn btn-ghost btn-sm" data-day="2">后天</button>
      </div>
      <div class="field-hint" style="margin-top:10px">
        同一车次在不同日期的担当车组可能不同，因此支持指定查询日期。
      </div>
    </div>

    <div id="result-host"></div>
  `

  const input = host.querySelector('#f-query')
  const dateEl = host.querySelector('#f-date')
  const resultHost = host.querySelector('#result-host')

  function paint() {
    const q = state.searched.query
    if (!q) { resultHost.innerHTML = ''; return }
    if (state.loading) {
      resultHost.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>查询中…</span></div>`
      return
    }

    const isTrainResult = state.searched.mode === 'train'

    if (isTrainResult && !state.single) {
      resultHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-subway empty-icon"></i>
        <div class="empty-text">未查询到 ${esc(q)} 的担当车组</div>
        <div class="field-hint">该车次可能尚未编组、当日不开行，或无公开担当数据</div>
      </div>`
      return
    }
    if (!isTrainResult && !state.list.length) {
      resultHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-subway empty-icon"></i>
        <div class="empty-text">未查询到车组 ${esc(q)} 的担当车次</div>
      </div>`
      return
    }

    if (isTrainResult) {
      const t = typeOf(state.single.train)
      resultHost.innerHTML = `
        <div class="card" style="margin-top:18px">
          <div class="card-title">${esc(state.searched.date)} · 车次 ${esc(q)} 的担当车组</div>
          <div class="record-row clickable" data-train-set="${esc(state.single.trainSet)}" style="cursor:pointer">
            <div style="flex:1">
              <div class="record-value" style="font-size:20px">${esc(state.single.trainSet || '—')}</div>
              <div class="field-hint">${t ? t + ' 次 · ' : ''}点击查看该车组担当的全部车次</div>
            </div>
            <i class="fas fa-chevron-right" style="color:var(--secondary)"></i>
          </div>
        </div>
      `
      const row = resultHost.querySelector('[data-train-set]')
      if (row && state.single.trainSet) {
        row.addEventListener('click', () => gotoTrainsOfSet(state.single.trainSet))
      }
      return
    }

    // 车组 → 担当车次
    const today = todayStr()
    const rows = state.list.map(r => {
      const isToday = r.date && String(r.date) === today
      return `
        <div class="record-row clickable" data-train="${esc(r.train)}" style="cursor:pointer;${isToday ? 'border-color:var(--theme);background:var(--theme-soft)' : ''}">
          <span class="record-value" style="font-size:17px">${esc(r.train)}</span>
          <span class="field-hint">${esc(typeOf(r.train))} 次</span>
          ${isToday ? '<span class="tag-pill blue">今日</span>' : ''}
          <span style="margin-left:auto;color:var(--secondary)"><i class="fas fa-chevron-right"></i></span>
        </div>
      `
    }).join('')

    resultHost.innerHTML = `
      <div class="card" style="margin-top:18px">
        <div class="card-title">
          ${esc(state.searched.date)} · 车组 <span class="mono">${esc(q)}</span> 担当 ${state.list.length} 趟车次
        </div>
        <div>${rows}</div>
      </div>
    `
    resultHost.querySelectorAll('[data-train]').forEach(el => {
      el.addEventListener('click', () => navigate('train-detail', { train: el.dataset.train, date: state.searched.date }))
    })
  }

  function gotoTrainsOfSet(trainSet) {
    if (!trainSet) return
    state.mode = 'emu'
    state.query = trainSet
    render(host)
    doSearch()
  }

  async function doSearch() {
    const q = input.value.trim().toUpperCase()
    const day = dateEl.value || todayStr()
    if (!q) { toast('请输入查询内容'); return }
    state.query = q
    state.date = day
    state.loading = true
    state.searched = { query: q, mode: state.mode, date: day }
    state.single = null
    state.list = []
    paint()

    const res = await getTrainData(state.mode, q, day)
    state.loading = false
    // 查询期间用户可能改了类型/关键词，此时以快照为准渲染
    if (state.mode === 'train') state.single = res.single || (res.list[0] || null)
    else state.list = res.list || []
    if (hostRef === host) paint()
  }

  host.querySelectorAll('[data-mode]').forEach(el => {
    el.addEventListener('click', () => {
      if (state.mode === el.dataset.mode) return
      state.mode = el.dataset.mode
      // 不清空结果：结果区由 searched 快照驱动，切类型只影响下一次查询
      render(host)
    })
  })
  host.querySelector('#btn-go').addEventListener('click', doSearch)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch() })
  dateEl.addEventListener('change', () => {
    // 日期变了就按新日期重查，结果与日期保持一致
    if (state.searched.query) { doSearch() }
  })
  host.querySelectorAll('[data-day]').forEach(b => {
    b.addEventListener('click', () => {
      dateEl.value = dateOffset(Number(b.dataset.day))
      doSearch()
    })
  })

  if (state.searched.query) paint()
}

registerView('emu-query', {
  title: '运用担当',
  subtitle: '按车次查车组，或按车组号查担当交路',
  icon: 'fa-subway',
  color: '#af52de',
  render,
  destroy() { hostRef = null }
})
