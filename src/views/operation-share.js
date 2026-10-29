/**
 * RailKale: Next PC - 运转分享
 * 移植自移动端 pages/operation-share + components/travel-card
 *
 * 桌面端改动：
 *  - 行程改为响应式卡片网格（不再单列竖排）
 *  - 新增行程用居中模态表单（手机端是底部浮层），字段两列排布
 *  - 删除按钮直接出现在卡片上，不依赖左滑手势
 *  - 卡片操作：查看车次详情 / 测速 / 行程车票 / 导出 .travel
 */

import { registerView, navigate } from '../js/router.js'
import { getTrains, getTrainInfoByDate, carModelOf, todayStr } from '../js/api.js'
import {
  SEAT_TYPES, macaronOf, loadTravels, addTravel, removeTravel,
  travelFileContent, shortDate, seatLine
} from '../js/travel.js'
import { escapeHTML, saveTextFile, debounce } from '../js/util.js'
import { toast, toastError, confirmDialog, modal } from '../js/ui.js'

let hostRef = null

function esc(s) { return escapeHTML(s) }

function travelCard(item) {
  const pal = macaronOf(item.id || item.train)
  const seat = seatLine(item)
  return `
    <div class="travel-card" data-id="${esc(item.id)}" style="background:${pal.bg};border-color:${pal.border}">
      <div class="travel-watermark" style="color:${pal.border}">${esc(item.train || '')}</div>
      <div class="travel-body">
        <div class="travel-route">
          <span>${esc(item.start || '—')}</span>
          <span class="travel-arrow">→</span>
          <span>${esc(item.end || '—')}</span>
          ${seat ? `<span class="travel-seat">${esc(seat)}</span>` : ''}
        </div>
        <div class="travel-meta">
          <span>${esc(shortDate(item.date) || '—')}</span>
          ${item.departTime ? `<span>${esc(item.departTime)} 开</span>` : ''}
          ${item.name ? `<span>${esc(item.name)}</span>` : ''}
          <span class="mono">${esc(item.train || '')}</span>
        </div>
      </div>
      ${item.model ? `<div class="travel-model">${esc(item.model)}</div>` : ''}
      <div class="travel-actions">
        <button class="travel-act" data-act="open" title="查看车次详情"><i class="fas fa-train"></i></button>
        <button class="travel-act" data-act="speed" title="定位测速"><i class="fas fa-gauge-high"></i></button>
        <button class="travel-act" data-act="ticket" title="生成行程车票"><i class="fas fa-ticket-alt"></i></button>
        <button class="travel-act" data-act="share" title="导出 .travel 文件"><i class="fas fa-share-nodes"></i></button>
        <button class="travel-act danger" data-act="remove" title="删除行程" style="margin-left:auto"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `
}

function render(host) {
  hostRef = host
  const travels = loadTravels()

  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:var(--theme)"><i class="fas fa-camera-retro"></i></div>
        <div>
          <div class="page-title">运转分享</div>
          <div class="page-subtitle">记录你的每一段旅程：车次、座席、座位与测速轨迹</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="tag-pill gray">${travels.length} 条行程</span>
        <button class="btn btn-sm" id="btn-add"><i class="fas fa-plus"></i> 添加行程</button>
      </div>
    </div>

    ${travels.length
      ? `<div class="travel-grid">${travels.map(travelCard).join('')}</div>`
      : `<div class="card">
          <div class="empty-state" style="padding:64px 20px">
            <i class="fas fa-suitcase-rolling empty-icon"></i>
            <div class="empty-text">还没有行程</div>
            <div class="field-hint">添加行程后，可以一键查看车次详情、生成行程车票或导出旅程记录</div>
            <button class="btn" id="btn-add-empty" style="margin-top:8px"><i class="fas fa-plus"></i> 添加第一条行程</button>
          </div>
        </div>`}
  `

  host.querySelector('#btn-add')?.addEventListener('click', () => openAddForm(() => render(host)))
  host.querySelector('#btn-add-empty')?.addEventListener('click', () => openAddForm(() => render(host)))

  host.querySelectorAll('.travel-card').forEach(card => {
    const id = card.dataset.id
    const item = travels.find(t => t.id === id)
    if (!item) return
    card.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const act = btn.dataset.act
        if (act === 'open') {
          if (!item.train) { toast('该行程没有车次号'); return }
          navigate('train-detail', { train: item.train, date: item.date || todayStr() })
        } else if (act === 'speed') {
          navigate('speed-test', { travelId: item.id, train: item.train || '' })
        } else if (act === 'ticket') {
          navigate('travel-ticket', { travelId: item.id })
        } else if (act === 'share') {
          await shareTravel(item)
        } else if (act === 'remove') {
          const ok = await confirmDialog('删除行程', `确定删除 ${item.start || '?'} → ${item.end || '?'}（${item.train || '无车次'}）吗？`, { danger: true, confirmText: '删除' })
          if (!ok) return
          removeTravel(item.id)
          render(host)
          toast('行程已删除')
        }
      })
    })
    card.addEventListener('dblclick', () => {
      if (item.train) navigate('train-detail', { train: item.train, date: item.date || todayStr() })
    })
  })
}

/** 导出 .travel 文件（Electron 走保存对话框，浏览器走下载） */
async function shareTravel(item) {
  const content = travelFileContent(item)
  const name = `${item.train || 'travel'}_${shortDate(item.date).replace('.', '') || 'record'}.travel`
  const res = await saveTextFile(name, content)
  if (res && res.ok) {
    toast(res.filePath ? `已保存到 ${res.filePath}` : '已导出 .travel 文件', { icon: 'success', duration: 3200 })
  } else {
    toastError('保存失败')
  }
}

// ---------------------------------------------------------------------------
// 添加行程表单（居中模态，两列排布）
// ---------------------------------------------------------------------------

function openAddForm(onSaved) {
  const form = {
    date: todayStr(),
    start: '',
    end: '',
    train: '',
    seatType: '',
    seatTypeCustom: '',
    carNum: '',
    seatNum: '',
    name: '',
    departTime: ''
  }
  let trainList = []
  let loadingTrains = false
  let hintText = ''
  let saving = false

  const body = document.createElement('div')
  body.innerHTML = `
    <div class="travel-form-grid">
      <div class="field"><label class="field-label">日期</label>
        <input class="input" type="date" data-f="date" value="${esc(form.date)}" /></div>
      <div class="field"><label class="field-label">乘车人 <span style="color:var(--red)">*</span></label>
        <input class="input" data-f="name" placeholder="姓名" /></div>
      <div class="field"><label class="field-label">始发站 <span style="color:var(--red)">*</span></label>
        <input class="input" data-f="start" placeholder="如：北京南" /></div>
      <div class="field"><label class="field-label">到达站 <span style="color:var(--red)">*</span></label>
        <input class="input" data-f="end" placeholder="如：上海虹桥" /></div>
      <div class="field"><label class="field-label">车次 <span style="color:var(--red)">*</span></label>
        <input class="input" data-f="train" placeholder="输入或从下方选择" /></div>
      <div class="field"><label class="field-label">座席 <span style="color:var(--red)">*</span></label>
        <select class="select" data-f="seatType">
          <option value="">请选择</option>
          ${SEAT_TYPES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
        </select></div>
      <div class="field" data-custom-seat style="display:none"><label class="field-label">座席名称</label>
        <input class="input" data-f="seatTypeCustom" placeholder="自行填写" /></div>
      <div class="field"><label class="field-label">车厢号</label>
        <input class="input" data-f="carNum" placeholder="如：1" /></div>
      <div class="field"><label class="field-label">座位号</label>
        <input class="input" data-f="seatNum" placeholder="如：1A" /></div>
    </div>
    <div style="margin-top:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" id="btn-load-trains"><i class="fas fa-search"></i> 按站查询可选车次</button>
      <span class="field-hint" id="train-hint"></span>
    </div>
    <div id="train-suggest" style="margin-top:10px"></div>
  `

  const $ = sel => body.querySelector(sel)
  const fields = {}
  body.querySelectorAll('[data-f]').forEach(el => {
    fields[el.dataset.f] = el
    el.addEventListener('input', () => { form[el.dataset.f] = el.value })
    el.addEventListener('change', () => { form[el.dataset.f] = el.value })
  })

  const seatSel = fields.seatType
  seatSel.addEventListener('change', () => {
    form.seatType = seatSel.value
    $('[data-custom-seat]').style.display = form.seatType === '其他' ? 'block' : 'none'
  })

  function paintSuggest() {
    const sugHost = $('#train-suggest')
    const hint = $('#train-hint')
    if (hint) hint.textContent = loadingTrains ? '正在查询车次…' : hintText
    if (!sugHost) return
    if (loadingTrains || !trainList.length) { sugHost.innerHTML = ''; return }
    sugHost.innerHTML = `
      <div style="max-height:190px;overflow:auto;border:0.5px solid var(--separator);border-radius:10px">
        ${trainList.map(t => `
          <div class="record-row clickable" data-pick="${esc(t.trainNo)}" style="cursor:pointer;margin:0;border-radius:0;border-left:none;border-right:none">
            <span class="record-value" style="font-size:15px">${esc(t.trainNo)}</span>
            <span class="field-hint mono">${esc(t.fromTime || '')} - ${esc(t.toTime || '')}</span>
            <span style="margin-left:auto;color:var(--secondary)"><i class="fas fa-plus"></i></span>
          </div>`).join('')}
      </div>`
    sugHost.querySelectorAll('[data-pick]').forEach(el => {
      el.addEventListener('click', () => {
        const t = trainList.find(x => x.trainNo === el.dataset.pick)
        if (!t) return
        fields.train.value = t.trainNo
        form.train = t.trainNo
        form.departTime = t.fromTime || ''
        sugHost.innerHTML = ''
        const h = $('#train-hint')
        if (h) h.textContent = `已选择 ${t.trainNo}（${t.fromTime || '—'} 开）`
      })
    })
  }

  async function loadTrains() {
    form.start = fields.start.value.trim()
    form.end = fields.end.value.trim()
    form.date = fields.date.value || todayStr()
    if (!form.start || !form.end) {
      hintText = '先填写始发站和到达站'
      paintSuggest()
      return
    }
    loadingTrains = true
    hintText = ''
    paintSuggest()
    try {
      const res = await getTrains(form.start, form.end, form.date)
      const list = (res && res.trains) || []
      const seen = {}
      trainList = list.filter(t => {
        const no = t && t.trainNo
        if (!no || seen[no]) return false
        seen[no] = true
        return true
      })
      hintText = trainList.length ? `找到 ${trainList.length} 个车次，点击选择` : '当天两站间未查询到车次，可直接手填'
    } catch (e) {
      trainList = []
      hintText = '车次查询失败，可直接手填'
    } finally {
      loadingTrains = false
      paintSuggest()
    }
  }

  $('#btn-load-trains').addEventListener('click', debounce(loadTrains, 120))

  modal({
    title: '添加行程',
    wide: true,
    body,
    buttons: [
      { text: '取消', value: false },
      { text: '保存行程', primary: true, value: true }
    ],
    onMount(bodyEl, close) {
      const foot = bodyEl.parentElement.querySelector('.modal-foot .btn:last-child')
      foot.addEventListener('click', async (e) => {
        e.stopImmediatePropagation()
        e.preventDefault()
        if (saving) return
        // 以 DOM 当前值为准（用户可能只改了值没触发 input）
        for (const k of Object.keys(fields)) form[k] = fields[k].value
        const okSubmit = !!(form.train && form.start && form.end && form.seatType && form.name)
        if (!okSubmit) {
          toast('请填写车次、始发到达、座席和乘车人')
          return
        }
        saving = true
        foot.disabled = true
        foot.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> 保存中…'
        try {
          // 车型取该车次当天的担当车组（用于卡片右下角）
          let model = ''
          try {
            const info = await getTrainInfoByDate(form.train, form.date)
            if (info && info.trainSet) model = carModelOf(info.trainSet)
          } catch (err) { /* 车型只是装饰，失败可忽略 */ }

          const seatType = form.seatType === '其他'
            ? (form.seatTypeCustom.trim() || '其他')
            : form.seatType

          addTravel({
            train: String(form.train).trim().toUpperCase(),
            start: form.start.trim(),
            end: form.end.trim(),
            model,
            seatType,
            carNum: String(form.carNum || '').trim(),
            seatNum: String(form.seatNum || '').trim(),
            name: form.name.trim(),
            date: form.date,
            departTime: form.departTime || '',
            gps: {}
          })
          close(true)
          toast('行程已添加', { icon: 'success' })
          if (onSaved) onSaved()
        } finally {
          saving = false
        }
      }, true)
    }
  })
}

registerView('operation-share', {
  title: '运转分享',
  subtitle: '记录与分享你的每一段旅程',
  icon: 'fa-camera-retro',
  color: '#ff2d55',
  render,
  destroy() { hostRef = null }
})
