/**
 * RailKale: Next PC - 行程车票
 * 移植自移动端 pages/travel-ticket：为某条行程生成纪念车票
 *
 * 桌面端：左侧行程信息卡 + 票据参数，右侧固定票据预览与保存按钮；
 * 出票时播放「打印机吐票」动画后再展示车票。
 */

import { registerView, navigate } from '../js/router.js'
import { getTicket } from '../js/api.js'
import { getTravel, seatLine, shortDate } from '../js/travel.js'
import { nextTicketSeq, formatTicketNo, parseTicketNo } from '../js/ticketNo.js'
import { escapeHTML, arrayBufferToBase64, saveBase64Image, today } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

let state = {
  travelId: '',
  item: null,
  ticketSrc: '',
  printing: false,
  loading: false,
  saving: false,
  extras: {
    upperNo: '',
    identity: '',
    price: ''
  }
}

let hostRef = null

function esc(s) { return escapeHTML(s) }

/** 身份证掩码：前 10 位原样，中间 4 位打星，末 4 位原样 */
function maskIdentity(id) {
  const s = String(id || '').trim()
  if (s.length < 8) return s
  return s.slice(0, 10) + '****' + s.slice(-4)
}

function render(host) {
  hostRef = host
  const item = state.item

  if (!item) {
    host.innerHTML = `
      <div class="page-head">
        <div class="page-head-left">
          <div class="page-head-icon" style="background:var(--theme)"><i class="fas fa-ticket-alt"></i></div>
          <div>
            <div class="page-title">行程车票</div>
            <div class="page-subtitle">为运转行程生成纪念车票</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="empty-state" style="padding:60px 20px">
          <i class="fas fa-ticket-alt empty-icon"></i>
          <div class="empty-text">未找到该行程</div>
          <div class="field-hint">请从「运转分享」中打开一条行程</div>
          <button class="btn btn-sm btn-ghost" data-goto="operation-share" style="margin-top:8px">
            <i class="fas fa-arrow-left"></i> 去运转分享</button>
        </div>
      </div>`
    host.querySelector('[data-goto]')?.addEventListener('click', () => navigate('operation-share'))
    return
  }

  const seat = seatLine(item)
  const seq = nextTicketSeq()

  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:var(--theme)"><i class="fas fa-ticket-alt"></i></div>
        <div>
          <div class="page-title">行程车票</div>
          <div class="page-subtitle">${esc(item.train || '')} · ${esc(item.start || '')} → ${esc(item.end || '')}</div>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" data-goto="operation-share"><i class="fas fa-arrow-left"></i> 返回行程</button>
    </div>

    <div class="detail-2col" style="grid-template-columns:minmax(0,1fr) 480px">
      <div>
        <div class="trip-hero">
          <div class="trip-head">
            <span class="trip-train">${esc(item.train || '—')}</span>
            <span class="trip-date">${esc(item.date || '')}</span>
          </div>
          <div class="trip-route">
            <span>${esc(item.start || '—')}</span>
            <span class="arrow">→</span>
            <span>${esc(item.end || '—')}</span>
          </div>
          <div class="trip-chips">
            ${item.departTime ? `<span class="trip-chip">${esc(item.departTime)} 开</span>` : ''}
            ${seat ? `<span class="trip-chip">${esc(seat)}</span>` : ''}
            ${item.name ? `<span class="trip-chip">${esc(item.name)}</span>` : ''}
            ${item.model ? `<span class="trip-chip">${esc(item.model)}</span>` : ''}
          </div>
        </div>

        <div class="card">
          <div class="card-title">填报信息（仅用于本次生成，不会上传）</div>
          <div class="travel-form-grid">
            <div class="field">
              <label class="field-label">上票号</label>
              <input class="input" id="f-upper" value="${esc(formatTicketNo(seq))}" />
              <div class="field-hint">下票号自动取 +1：${esc(formatTicketNo(seq + 1))}</div>
            </div>
            <div class="field">
              <label class="field-label">身份证号</label>
              <input class="input" id="f-identity" placeholder="可留空，将自动掩码" />
              <div class="field-hint">即使填写也只会以 0000000000****0000 形式出现在票面</div>
            </div>
            <div class="field">
              <label class="field-label">票价</label>
              <input class="input" id="f-price" placeholder="如：553.00" />
              <div class="field-hint">留空显示 0.00</div>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-side">
        <div class="card">
          <div class="card-title">车票预览</div>
          <div id="preview-host">
            ${state.printing ? `
              <div class="print-stage">
                <div class="printer">
                  <div class="printer-slot"></div>
                  <div class="printer-paper ejecting"></div>
                </div>
                <div class="print-text">正在出票…</div>
              </div>` : state.ticketSrc ? `
              <div class="ticket-preview new" style="margin-top:0">
                <img class="ticket-image" src="${esc(state.ticketSrc)}" alt="行程车票" />
              </div>
              <div class="ticket-actions">
                <button class="btn" id="btn-save"><i class="fas fa-download"></i> 保存车票</button>
                <button class="btn btn-ghost" id="btn-again"><i class="fas fa-redo"></i> 重新出票</button>
              </div>` : `
              <div class="empty-state" style="padding:52px 16px">
                <i class="fas fa-print empty-icon"></i>
                <div class="empty-text">点击下方按钮打印车票</div>
              </div>
              <button class="btn btn-lg" id="btn-print" style="width:100%"><i class="fas fa-print"></i> 打印车票</button>`}
          </div>
        </div>

        <div class="card">
          <div class="card-title">提示</div>
          <div class="field-hint" style="line-height:1.8">
            车票由自有接口实时生成，票面信息来自当前行程。<br />
            本页面不会收集或上报任何身份信息，所有内容仅保存在本机。
          </div>
        </div>
      </div>
    </div>
  `

  host.querySelector('[data-goto]')?.addEventListener('click', () => navigate('operation-share'))

  const upperEl = host.querySelector('#f-upper')
  const idEl = host.querySelector('#f-identity')
  const priceEl = host.querySelector('#f-price')

  host.querySelector('#btn-print')?.addEventListener('click', () => printTicket(upperEl, idEl, priceEl))
  host.querySelector('#btn-again')?.addEventListener('click', () => {
    state.ticketSrc = ''
    state.extras.upperNo = formatTicketNo(nextTicketSeq())
    render(host)
  })
  host.querySelector('#btn-save')?.addEventListener('click', () => saveTicket())
}

async function printTicket(upperEl, idEl, priceEl) {
  if (!state.item || state.loading) return

  const rawUpper = upperEl ? upperEl.value.trim() : ''
  const seq = parseTicketNo(rawUpper) || nextTicketSeq()
  const upperNo = formatTicketNo(seq)
  const identity = idEl && idEl.value.trim() ? maskIdentity(idEl.value.trim()) : ''
  const price = priceEl && priceEl.value.trim() ? priceEl.value.trim() : '0.00'

  state.loading = true
  try {
    const it = state.item
    const buf = await getTicket({
      ticketNo: upperNo,
      startStation: it.start || '',
      endStation: it.end || '',
      trainNo: it.train || '',
      date: it.date || today(),
      time: it.departTime || '00:00',
      carriageNo: Number(it.carNum) || 1,
      seatNo: it.seatNum || '1',
      seatClass: it.seatType || '二等座',
      price,
      identity: identity || '000000000000000000',
      name: it.name || '',
      ticketMachineId: 'RAIL-001',
      qrcodeString: 'https://next.laide.net.cn/',
      checkinRoom: '',
      startStationPY: '',
      endStationPY: ''
    })
    const base64 = arrayBufferToBase64(buf)
    state.ticketSrc = 'data:image/png;base64,' + base64
    // 出票动画：先把车票盖住，动画结束再展示
    state.printing = true
    if (hostRef) render(hostRef)
    setTimeout(() => {
      state.printing = false
      if (hostRef) render(hostRef)
    }, 1600)
  } catch (e) {
    toastError('出票失败，请重试')
  } finally {
    state.loading = false
  }
}

async function saveTicket() {
  if (!state.ticketSrc || state.saving) return
  state.saving = true
  try {
    const base64 = String(state.ticketSrc).split(',')[1] || ''
    const name = `RailKale-${state.item.train || 'travel'}-${shortDate(state.item.date).replace('.', '')}.png`
    const res = await saveBase64Image(base64, name)
    if (res && res.ok) toast('车票已保存', { icon: 'success' })
    else toastError(res && res.error ? res.error : '保存失败')
  } catch (e) {
    toastError('保存失败')
  } finally {
    state.saving = false
  }
}

registerView('travel-ticket', {
  title: '行程车票',
  subtitle: '为行程生成纪念车票',
  icon: 'fa-ticket-alt',
  color: '#ff9500',
  hidden: true,
  render,
  onEnter(params) {
    const id = params && params.travelId
    if (id && id !== state.travelId) {
      state.travelId = id
      state.item = getTravel(id)
      state.ticketSrc = ''
      state.printing = false
    } else if (id) {
      state.item = getTravel(id)
    }
  },
  destroy() { hostRef = null }
})
