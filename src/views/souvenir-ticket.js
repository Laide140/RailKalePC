/**
 * RailKale: Next PC - 纪念车票
 */

import { registerView } from '../js/router.js'
import { getTicket } from '../js/api.js'
import { today, escapeHTML, arrayBufferToBase64, saveBase64Image } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

let state = {
  form: {
    ticketNo: 'TICKET' + Date.now().toString(36).toUpperCase(),
    startStation: '',
    endStation: '',
    trainNo: '',
    date: today(),
    time: '',
    carriageNo: '',
    seatNo: '',
    seatClass: '',
    price: '',
    identity: '',
    name: '',
    ticketMachineId: 'RAIL-001',
    qrcodeString: 'https://next.laide.net.cn/',
    checkinRoom: '',
    startStationPY: '',
    endStationPY: ''
  },
  src: '',
  generating: false
}
let hostRef = null

function esc(s) { return escapeHTML(s) }

function render(host) {
  hostRef = host
  const f = state.form

  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:linear-gradient(135deg,#FF6B35,#E74C3C)"><i class="fas fa-print"></i></div>
        <div>
          <div class="page-title">纪念车票</div>
          <div class="page-subtitle">生成纪念车票图片并保存到本地</div>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">车票信息</div>
        <div class="form-row">
          <div class="field"><label class="field-label">车次号 *</label>
            <input class="input" data-f="trainNo" placeholder="如：G1" value="${esc(f.trainNo)}" /></div>
          <div class="field"><label class="field-label">日期</label>
            <input class="input" type="date" data-f="date" value="${esc(f.date)}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label class="field-label">始发站 *</label>
            <input class="input" data-f="startStation" placeholder="如：北京南" value="${esc(f.startStation)}" /></div>
          <div class="field"><label class="field-label">终点站 *</label>
            <input class="input" data-f="endStation" placeholder="如：上海虹桥" value="${esc(f.endStation)}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label class="field-label">发车时间</label>
            <input class="input" data-f="time" placeholder="如：06:30" value="${esc(f.time)}" /></div>
          <div class="field"><label class="field-label">票价</label>
            <input class="input" data-f="price" placeholder="如：553.00" value="${esc(f.price)}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label class="field-label">车厢号</label>
            <input class="input" data-f="carriageNo" placeholder="如：05" value="${esc(f.carriageNo)}" /></div>
          <div class="field"><label class="field-label">座位号</label>
            <input class="input" data-f="seatNo" placeholder="如：12A" value="${esc(f.seatNo)}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label class="field-label">座位等级</label>
            <input class="input" data-f="seatClass" placeholder="如：二等座" value="${esc(f.seatClass)}" /></div>
          <div class="field"><label class="field-label">检票口</label>
            <input class="input" data-f="checkinRoom" placeholder="如：10A" value="${esc(f.checkinRoom)}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label class="field-label">乘客姓名 *</label>
            <input class="input" data-f="name" placeholder="请输入姓名" value="${esc(f.name)}" /></div>
          <div class="field"><label class="field-label">身份证号</label>
            <input class="input" data-f="identity" placeholder="请输入身份证号" value="${esc(f.identity)}" /></div>
        </div>
        <div class="field"><label class="field-label">票号</label>
          <input class="input" data-f="ticketNo" value="${esc(f.ticketNo)}" /></div>
        <div class="form-row">
          <div class="field"><label class="field-label">始发站拼音</label>
            <input class="input" data-f="startStationPY" placeholder="如：BEIJINGNAN" value="${esc(f.startStationPY)}" /></div>
          <div class="field"><label class="field-label">终点站拼音</label>
            <input class="input" data-f="endStationPY" placeholder="如：SHANGHAIHONGQIAO" value="${esc(f.endStationPY)}" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label class="field-label">制票机号</label>
            <input class="input" data-f="ticketMachineId" value="${esc(f.ticketMachineId)}" /></div>
          <div class="field"><label class="field-label">二维码内容</label>
            <input class="input" data-f="qrcodeString" value="${esc(f.qrcodeString)}" /></div>
        </div>
        <button class="btn btn-lg" id="btn-gen" style="width:100%;margin-top:8px;background:linear-gradient(135deg,#FF6B35,#E74C3C)">
          <i class="fas fa-ticket-alt"></i> 生成纪念车票
        </button>
      </div>

      <div>
        <div class="card" style="position:sticky;top:16px">
          <div class="card-title">预览</div>
          <div id="preview-host">
            <div class="empty-state" style="padding:60px 20px">
              <i class="fas fa-print empty-icon"></i>
              <div class="empty-text">填写信息后生成纪念车票</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  const previewHost = host.querySelector('#preview-host')

  function paintPreview() {
    if (state.generating) {
      previewHost.innerHTML = `<div class="loading-state" style="padding:60px"><div class="spinner"></div><span>正在生成…</span></div>`
      return
    }
    if (!state.src) {
      previewHost.innerHTML = `<div class="empty-state" style="padding:60px 20px">
        <i class="fas fa-print empty-icon"></i>
        <div class="empty-text">填写信息后生成纪念车票</div>
      </div>`
      return
    }
    previewHost.innerHTML = `
      <div class="ticket-preview" style="margin-top:0">
        <img class="ticket-image" src="${state.src}" alt="纪念车票" />
        <div style="margin-top:16px;display:flex;gap:10px;justify-content:center">
          <button class="btn" id="btn-save"><i class="fas fa-download"></i> 保存图片</button>
          <button class="btn btn-ghost" id="btn-regen"><i class="fas fa-sync-alt"></i> 重新生成</button>
        </div>
      </div>
    `
    previewHost.querySelector('#btn-save').addEventListener('click', async () => {
      const base64 = state.src.replace(/^data:image\/\w+;base64,/, '')
      const res = await saveBase64Image(base64, `纪念车票_${state.form.trainNo || 'ticket'}.png`)
      if (res && res.ok) toast('已保存' + (res.filePath ? '：' + res.filePath : ''), { icon: 'success', duration: 3000 })
      else if (res && res.error) toastError('保存失败：' + res.error)
    })
    previewHost.querySelector('#btn-regen').addEventListener('click', generate)
  }

  async function generate() {
    const f2 = state.form
    if (!f2.startStation || !f2.endStation || !f2.trainNo || !f2.name) {
      toast('请填写必要信息（* 标注项）')
      return
    }
    state.generating = true
    paintPreview()
    try {
      const buf = await getTicket({
        ticketNo: f2.ticketNo,
        startStation: f2.startStation,
        endStation: f2.endStation,
        trainNo: f2.trainNo,
        date: f2.date,
        time: f2.time || '00:00',
        carriageNo: Number(f2.carriageNo) || 1,
        seatNo: f2.seatNo || '1',
        seatClass: f2.seatClass || '二等座',
        price: f2.price || '0.00',
        identity: f2.identity || '000000000000000000',
        name: f2.name,
        ticketMachineId: f2.ticketMachineId,
        qrcodeString: f2.qrcodeString,
        checkinRoom: f2.checkinRoom ? `检票口：${f2.checkinRoom}` : '',
        startStationPY: f2.startStationPY || '',
        endStationPY: f2.endStationPY || ''
      })
      state.src = 'data:image/png;base64,' + arrayBufferToBase64(buf)
      toast('生成成功', { icon: 'success' })
    } catch (e) {
      console.error(e)
      toastError('生成失败，请重试')
    }
    state.generating = false
    if (hostRef === host) paintPreview()
  }

  host.querySelectorAll('[data-f]').forEach(el => {
    el.addEventListener('input', () => { state.form[el.dataset.f] = el.value })
    el.addEventListener('change', () => { state.form[el.dataset.f] = el.value })
  })
  host.querySelector('#btn-gen').addEventListener('click', generate)

  paintPreview()
}

registerView('souvenir-ticket', {
  title: '纪念车票',
  icon: 'fa-print',
  color: '#ff9500',
  render,
  destroy() { hostRef = null }
})
