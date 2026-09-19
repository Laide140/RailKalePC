/**
 * RailKale: Next PC - UI 组件（Toast / Modal / 确认框）
 * 对应移动端的 uni.showToast / uni.showModal
 */

import { escapeHTML } from './util.js'

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastWrap = null

function ensureToastWrap() {
  if (!toastWrap) {
    toastWrap = document.createElement('div')
    toastWrap.className = 'toast-wrap'
    document.body.appendChild(toastWrap)
  }
  return toastWrap
}

const ICONS = {
  success: 'fa-check-circle',
  error: 'fa-times-circle',
  info: 'fa-info-circle',
  none: 'fa-info-circle'
}

/**
 * 轻提示
 * @param {string} message
 * @param {{icon?: 'success'|'error'|'info'|'none', duration?: number}} opts
 */
export function toast(message, opts = {}) {
  const icon = opts.icon || 'none'
  const duration = opts.duration || 2000
  const wrap = ensureToastWrap()

  const el = document.createElement('div')
  el.className = 'toast ' + (icon === 'success' ? 'success' : icon === 'error' ? 'error' : '')
  const iconClass = ICONS[icon] || ICONS.none
  el.innerHTML = icon === 'none'
    ? `<span>${escapeHTML(message)}</span>`
    : `<i class="fas ${iconClass} toast-icon"></i><span>${escapeHTML(message)}</span>`

  wrap.appendChild(el)

  setTimeout(() => {
    el.classList.add('leaving')
    setTimeout(() => el.remove(), 220)
  }, duration)
  return el
}

export const toastSuccess = (m) => toast(m, { icon: 'success' })
export const toastError = (m) => toast(m, { icon: 'error' })

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

let activeModal = null

/**
 * 通用模态框
 * @param {{
 *   title: string,
 *   body: string|HTMLElement,
 *   wide?: boolean,
 *   buttons?: Array<{text:string, primary?:boolean, danger?:boolean, value?:any}>,
 *   onMount?: (bodyEl: HTMLElement, close: (v:any)=>void) => void
 * }} opts
 * @returns {Promise<any>}
 */
export function modal(opts) {
  return new Promise((resolve) => {
    closeModal()

    const mask = document.createElement('div')
    mask.className = 'modal-mask'

    const box = document.createElement('div')
    box.className = 'modal' + (opts.wide ? ' wide' : '')

    const head = document.createElement('div')
    head.className = 'modal-head'
    head.textContent = opts.title || ''

    const body = document.createElement('div')
    body.className = 'modal-body'
    if (typeof opts.body === 'string') body.innerHTML = opts.body
    else if (opts.body instanceof HTMLElement) body.appendChild(opts.body)

    box.appendChild(head)
    box.appendChild(body)

    const close = (value) => {
      mask.remove()
      activeModal = null
      document.removeEventListener('keydown', onKey)
      resolve(value)
    }

    const onKey = (e) => {
      if (e.key === 'Escape') close(null)
    }

    if (opts.buttons && opts.buttons.length) {
      const foot = document.createElement('div')
      foot.className = 'modal-foot'
      for (const b of opts.buttons) {
        const btn = document.createElement('button')
        btn.className = 'btn' + (b.primary ? '' : ' btn-ghost') + (b.danger ? ' btn-danger' : '')
        btn.textContent = b.text
        btn.addEventListener('click', () => close(b.value !== undefined ? b.value : b.text))
        foot.appendChild(btn)
      }
      box.appendChild(foot)
    }

    mask.appendChild(box)
    mask.addEventListener('mousedown', (e) => {
      if (e.target === mask && opts.dismissible !== false) close(null)
    })
    document.addEventListener('keydown', onKey)
    document.body.appendChild(mask)
    activeModal = { mask, close }

    if (opts.onMount) opts.onMount(body, close)

    // 自动聚焦第一个输入框
    const firstInput = body.querySelector('input, textarea')
    if (firstInput) setTimeout(() => firstInput.focus(), 60)
  })
}

export function closeModal() {
  if (activeModal) {
    activeModal.mask.remove()
    activeModal = null
  }
}

/** 确认框 */
export function confirmDialog(title, message, opts = {}) {
  return modal({
    title,
    body: `<div style="font-size:14px;line-height:1.65;color:var(--label2)">${escapeHTML(message)}</div>`,
    buttons: [
      { text: opts.cancelText || '取消', value: false },
      { text: opts.confirmText || '确定', primary: true, danger: opts.danger, value: true }
    ]
  })
}

/** 单行输入框 */
export function promptDialog(title, defaultValue = '', opts = {}) {
  const wrap = document.createElement('div')
  wrap.innerHTML = `<input class="input" id="rk-prompt-input" placeholder="${escapeHTML(opts.placeholder || '')}" />`
  const input = wrap.querySelector('input')
  input.value = defaultValue

  return modal({
    title,
    body: wrap,
    buttons: [
      { text: '取消', value: null },
      { text: opts.confirmText || '确定', primary: true, value: undefined }
    ],
    onMount: (bodyEl, close) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') close(input.value)
      })
      bodyEl.parentElement.querySelector('.modal-foot .btn:last-child')
        .addEventListener('click', (e) => {
          e.stopImmediatePropagation()
          close(input.value)
        }, true)
    }
  })
}

/** 选择列表（对应 uni.showActionSheet） */
export function actionSheet(title, items) {
  const wrap = document.createElement('div')
  wrap.style.display = 'flex'
  wrap.style.flexDirection = 'column'
  wrap.style.gap = '8px'

  return modal({
    title,
    body: wrap,
    dismissible: true,
    onMount: (bodyEl, close) => {
      // 移除默认尾部（无按钮时不存在）
      items.forEach((item, i) => {
        const btn = document.createElement('button')
        btn.className = 'btn btn-ghost'
        btn.style.width = '100%'
        btn.style.justifyContent = 'flex-start'
        btn.textContent = typeof item === 'string' ? item : item.text
        btn.addEventListener('click', () => close(i))
        bodyEl.appendChild(btn)
      })
    },
    buttons: [{ text: '取消', value: null }]
  })
}
