/**
 * RailKale: Next PC - 自定义主页编辑器
 * 卡片式：新建 / 重命名 / 删除卡片，添加 / 移除功能，设置主题色
 */

import { registerView, navigate } from '../js/router.js'
import { FEATURES, getFeature } from '../js/features.js'
import { getSettings, saveSettings, genId, hexToRgba } from '../js/settings.js'
import { escapeHTML } from '../js/util.js'
import { toast, toastError, confirmDialog, promptDialog, modal } from '../js/ui.js'

const CARD_COLORS = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5856d6', '#5ac8fa', '#ff2d55']

let cards = []
let loaded = false

function esc(s) { return escapeHTML(s) }

function loadCards() {
  cards = (getSettings().customCards || []).map(c => ({ ...c, features: [...(c.features || [])] }))
  loaded = true
}

function render(host) {
  if (!loaded) loadCards()

  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:#af52de"><i class="fas fa-palette"></i></div>
        <div>
          <div class="page-title">自定义主页</div>
          <div class="page-subtitle">搭建你自己的功能卡片 · 共 ${cards.length} 张</div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" id="btn-add"><i class="fas fa-plus"></i> 添加卡片</button>
        <button class="btn btn-sm" id="btn-save"><i class="fas fa-check"></i> 保存布局</button>
      </div>
    </div>

    <div id="cards-host"></div>

    <div class="card" style="margin-top:22px">
      <div class="card-title">功能托盘 · 点击即可添加到卡片</div>
      <div class="grid-panel" id="tray">
        ${FEATURES.map(f => `
          <div class="grid-tile" data-feature="${f.id}">
            <div class="grid-tile-icon" style="background:${f.color}"><i class="fas ${f.icon}"></i></div>
            <span class="grid-tile-label">${esc(f.label)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `

  paintCards(host)

  host.querySelector('#btn-add').addEventListener('click', () => {
    cards.push({ id: genId('card'), title: '新卡片', color: '#007aff', bgImage: '', features: [] })
    paintCards(host)
  })

  host.querySelector('#btn-save').addEventListener('click', async () => {
    const clean = cards.map(c => ({
      id: c.id,
      title: c.title || '未命名',
      color: c.color,
      bgImage: c.bgImage || '',
      features: c.features
    }))
    await saveSettings({ customCards: clean, homeLayout: 'custom' })
    loaded = false
    toast('布局已保存，首页已切换到自定义模式', { icon: 'success' })
    navigate('home')
  })

  host.querySelectorAll('[data-feature]').forEach(el => {
    el.addEventListener('click', () => pickCardForFeature(el.dataset.feature, host))
  })
}

function paintCards(host) {
  const cardsHost = host.querySelector('#cards-host')

  if (!cards.length) {
    cardsHost.innerHTML = `<div class="empty-state" style="background:var(--card);border-radius:var(--radius);border:1.5px dashed var(--separator)">
      <i class="fas fa-th-large empty-icon"></i>
      <div class="empty-text">还没有卡片，先添加一张吧</div>
      <button class="btn" id="btn-add-empty"><i class="fas fa-plus"></i> 添加卡片</button>
    </div>`
    cardsHost.querySelector('#btn-add-empty').addEventListener('click', () => {
      cards.push({ id: genId('card'), title: '新卡片', color: '#007aff', bgImage: '', features: [] })
      paintCards(host)
    })
    return
  }

  cardsHost.innerHTML = `<div class="custom-cards">${cards.map((card, ci) => {
    const style = card.bgImage
      ? `background-image:url('${esc(card.bgImage)}');background-size:cover;background-position:center`
      : `background:linear-gradient(135deg, ${card.color} 0%, ${hexToRgba(card.color, 0.65)} 100%)`

    return `
      <div class="custom-card" style="${style};cursor:default;min-height:200px">
        <div style="position:absolute;top:16px;left:20px;right:20px;display:flex;justify-content:space-between;align-items:center;z-index:2">
          <input class="cz-title-input" data-title="${ci}" value="${esc(card.title)}"
                 style="background:transparent;border:none;outline:none;color:#fff;font-size:18px;font-weight:700;
                        text-shadow:0 1px 4px rgba(0,0,0,.35);flex:1;min-width:0" />
          <div style="display:flex;gap:6px">
            <button class="cz-mini" data-bg="${ci}" title="设置背景图"><i class="fas fa-image"></i></button>
            <button class="cz-mini" data-del="${ci}" title="删除卡片"><i class="fas fa-trash"></i></button>
          </div>
        </div>

        <div style="position:relative;z-index:2;margin-top:52px">
          <div style="display:flex;flex-wrap:wrap;gap:7px;min-height:30px">
            ${card.features.length
              ? card.features.map((fid, fi) => {
                  const f = getFeature(fid)
                  if (!f) return ''
                  return `<span class="custom-card-tag" style="cursor:pointer" data-rm="${ci}:${fi}" title="点击移除">
                    <i class="fas ${f.icon}" style="margin-right:5px"></i>${esc(f.label)} <span style="opacity:.5;margin-left:3px">×</span>
                  </span>`
                }).join('')
              : `<span style="font-size:12px;color:rgba(255,255,255,.75);border:1px dashed rgba(255,255,255,.5);
                        border-radius:8px;padding:7px 12px">点击下方功能托盘添加功能</span>`}
          </div>

          <div style="display:flex;align-items:center;gap:8px;margin-top:16px;flex-wrap:wrap">
            ${CARD_COLORS.map(c => `
              <span data-color="${ci}:${c}" style="width:19px;height:19px;border-radius:50%;background:${c};
                    border:2px solid ${card.color === c ? '#fff' : 'rgba(255,255,255,.55)'};cursor:pointer;
                    ${card.color === c ? 'box-shadow:0 0 0 2px rgba(255,255,255,.6)' : ''}"></span>
            `).join('')}
            ${card.bgImage ? `<button class="cz-mini" data-rmbg="${ci}" style="width:auto;padding:0 10px;font-size:11px">
              <i class="fas fa-eraser"></i> 移除背景</button>` : ''}
          </div>
        </div>
      </div>
    `
  }).join('')}</div>`

  // 标题编辑
  cardsHost.querySelectorAll('[data-title]').forEach(el => {
    el.addEventListener('input', () => { cards[Number(el.dataset.title)].title = el.value })
  })
  // 删除卡片
  cardsHost.querySelectorAll('[data-del]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation()
      const ci = Number(el.dataset.del)
      const ok = await confirmDialog('删除卡片', `确定删除「${cards[ci].title || '未命名'}」吗？`, { danger: true, confirmText: '删除' })
      if (!ok) return
      cards.splice(ci, 1)
      paintCards(host)
    })
  })
  // 移除功能
  cardsHost.querySelectorAll('[data-rm]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      const [ci, fi] = el.dataset.rm.split(':').map(Number)
      cards[ci].features.splice(fi, 1)
      paintCards(host)
    })
  })
  // 主题色
  cardsHost.querySelectorAll('[data-color]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      const [ci, c] = el.dataset.color.split(':')
      cards[Number(ci)].color = c
      paintCards(host)
    })
  })
  // 背景图
  cardsHost.querySelectorAll('[data-bg]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      pickBackground(Number(el.dataset.bg), host)
    })
  })
  cardsHost.querySelectorAll('[data-rmbg]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      cards[Number(el.dataset.rmbg)].bgImage = ''
      paintCards(host)
    })
  })
}

async function pickCardForFeature(featureId, host) {
  if (!cards.length) { toast('请先添加一张卡片'); return }
  const f = getFeature(featureId)
  const wrap = document.createElement('div')
  wrap.style.display = 'flex'
  wrap.style.flexDirection = 'column'
  wrap.style.gap = '8px'
  wrap.innerHTML = `<div class="field-hint" style="margin-bottom:8px">把「${esc(f.label)}」添加到：</div>`

  const result = await modal({
    title: '选择卡片',
    body: wrap,
    buttons: [{ text: '取消', value: null }],
    onMount: (bodyEl, close) => {
      cards.forEach((c, i) => {
        const btn = document.createElement('button')
        btn.className = 'btn btn-ghost'
        btn.style.width = '100%'
        btn.style.justifyContent = 'space-between'
        const has = c.features.includes(featureId)
        btn.innerHTML = `<span>${esc(c.title || '未命名')}</span>
          <span style="font-size:12px;color:var(--secondary)">${c.features.length} 项${has ? ' · 已添加' : ''}</span>`
        btn.addEventListener('click', () => close(i))
        bodyEl.appendChild(btn)
      })
    }
  })

  if (result === null || result === undefined) return
  const card = cards[result]
  if (card.features.includes(featureId)) { toast('该功能已在此卡片中'); return }
  card.features.push(featureId)
  toast(`已添加到「${card.title || '未命名'}」`, { icon: 'success' })
  paintCards(host)
}

async function pickBackground(ci, host) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.addEventListener('change', () => {
    const file = input.files && input.files[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) { toastError('图片过大（请小于 4MB）'); return }
    const reader = new FileReader()
    reader.onload = () => {
      cards[ci].bgImage = reader.result
      toast('背景图已设置', { icon: 'success' })
      paintCards(host)
    }
    reader.onerror = () => toastError('读取图片失败')
    reader.readAsDataURL(file)
  })
  input.click()
}

registerView('custom-editor', {
  title: '自定义主页',
  icon: 'fa-palette',
  color: '#af52de',
  hidden: true,
  render,
  destroy() { loaded = false }
})
