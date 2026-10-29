/**
 * RailKale: Next PC - 设置
 * 首页布局 / API 源 / 主题色 / 接口密钥 / 缓存 / 应用信息
 *
 * 主题色与移动端一致：以当前主题色为基准的同色系深浅预设 + HSL 调色器。
 */

import { registerView, navigate } from '../js/router.js'
import {
  getSettings, saveSettings, resetSettings,
  applyTheme, cacheSizeMB, cacheClear
} from '../js/settings.js'
import { KEY_DEFS, hasKey, isFromFile } from '../js/keys.js'
import { normalizeHex, hexToHsl, hslToHex, parseHex, tint, shade } from '../js/color.js'
import { escapeHTML } from '../js/util.js'
import { toast, toastError, confirmDialog, modal } from '../js/ui.js'

let hostRef = null
let pickerHsl = { h: 210, s: 100, l: 50 }

function esc(s) { return escapeHTML(s) }

function render(host) {
  hostRef = host
  const s = getSettings()
  const theme = normalizeHex(s.themeColor || '#007aff')
  pickerHsl = hexToHsl(theme)
  const tones = tonePresetsOf(theme)
  const apiSrc = s.apiSource || 'next'

  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:var(--secondary)"><i class="fas fa-sliders-h"></i></div>
        <div>
          <div class="page-title">设置</div>
          <div class="page-subtitle">主题色、API 源、接口密钥与首页布局</div>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" id="btn-reset"><i class="fas fa-sync-alt"></i> 恢复默认</button>
    </div>

    <div class="settings-grid">
      <!-- 首页布局 -->
      <div class="card">
        <div class="card-title">首页布局</div>
        <div class="option-row">
          ${[['card', '分区卡片', '大图卡片展示三个分区'],
             ['grid', '宫格', '按分区分组的图标网格'],
             ['custom', '自定义', '完全由你搭建的卡片']]
            .map(([v, t, d]) => `
              <div class="option-card ${s.homeLayout === v ? 'active' : ''}" data-layout="${v}">
                <div class="option-card-title">${esc(t)}</div>
                <div class="option-card-desc">${esc(d)}</div>
              </div>`).join('')}
        </div>
        ${s.homeLayout === 'custom'
          ? `<button class="btn btn-ghost btn-sm" style="margin-top:12px" id="btn-editor"><i class="fas fa-palette"></i> 打开自定义主页编辑器</button>`
          : ''}
      </div>

      <!-- API 源 -->
      <div class="card">
        <div class="card-title" style="display:flex;align-items:center;gap:10px">
          <span>API 源</span>
          <span class="tag-pill blue" style="text-transform:none;letter-spacing:0"><i class="fas fa-shield-halved"></i> 全自有数据源</span>
        </div>
        <div class="field-hint" style="margin-bottom:12px">
          车次、时刻表、站台、线路、实时位置、车组担当等数据均由自有服务器提供，不依赖第三方接口。
        </div>
        <div class="option-row">
          ${[['next', '新', 'next.laide.net.cn/api/v3', '推荐'],
             ['old', '旧', 'rail.laide.asia', ''],
             ['railgo', 'RailGo', 'rg-api.zenglingkun.cn', '友商']]
            .map(([v, t, h, badge]) => `
              <div class="option-card ${apiSrc === v ? 'active' : ''}" data-api="${v}">
                <div class="option-card-title">${esc(t)}
                  ${badge ? `<span class="badge-mini ${badge === '友商' ? 'friend' : ''}">${esc(badge)}</span>` : ''}
                </div>
                <div class="option-card-desc">${esc(h)}</div>
              </div>`).join('')}
        </div>
        ${apiSrc === 'railgo' ? `<div class="route-plan" style="margin-top:12px">
          <b>RailGo Data Service</b>
          <span class="field-hint">数据由 RailGo Data Service 提供，仅覆盖车站大屏 / 检票口 / 线路图。</span>
        </div>` : ''}
        <div class="field-hint" style="margin-top:12px">
          RailGo 仅支持车站大屏、检票口、线路图；其余功能自动回退到自有「新」数据源。
        </div>
      </div>

      <!-- 主题色 -->
      <div class="card" style="grid-column:1/-1">
        <div class="card-title">主题色</div>
        <div class="theme-picker-row">
          <div style="flex:1;min-width:280px">
            <div class="field-hint" style="margin-bottom:10px">推荐配色（以当前主题色为基准的同色系深浅）：</div>
            <div class="swatches">
              ${tones.map((c, i) => `
                <div class="swatch ${c === theme ? 'selected' : ''}" style="background:${c}"
                     data-color="${c}" title="${c}${i === 2 ? '（当前）' : ''}">
                  ${c === theme ? '<i class="fas fa-check" style="color:#fff"></i>' : ''}
                </div>`).join('')}
            </div>
            <div class="field-hint" style="margin-bottom:10px;margin-top:14px">常用色：</div>
            <div class="swatches">
              ${PRESETS.map(c => `
                <div class="swatch ${c === theme ? 'selected' : ''}" style="background:${c}"
                     data-color="${c}" title="${c}">
                  ${c === theme ? '<i class="fas fa-check" style="color:#fff"></i>' : ''}
                </div>`).join('')}
            </div>
          </div>

          <div style="flex:1;min-width:300px;background:var(--card2);border-radius:12px;padding:14px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
              <div id="picker-preview" style="width:42px;height:42px;border-radius:10px;background:${esc(theme)};
                          border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.15);flex-shrink:0"></div>
              <input class="input" id="hex-input" value="${esc(theme)}" style="flex:1" />
              <button class="btn btn-sm" id="btn-apply-hex">应用</button>
            </div>
            <div class="slider-row"><span class="slider-label">色相</span>
              <input type="range" id="sl-h" min="0" max="360" value="${pickerHsl.h}" /></div>
            <div class="slider-row"><span class="slider-label">饱和</span>
              <input type="range" id="sl-s" min="0" max="100" value="${pickerHsl.s}" /></div>
            <div class="slider-row"><span class="slider-label">亮度</span>
              <input type="range" id="sl-l" min="0" max="100" value="${pickerHsl.l}" /></div>
          </div>
        </div>
      </div>

      <!-- 接口密钥 -->
      <div class="card">
        <div class="card-title">接口密钥</div>
        ${KEY_DEFS.map(k => {
          const v = (s.keys || {})[k.id]
          const custom = !!(v && v !== 'default' && v !== '')
          const fromFile = !custom && isFromFile(k.id)
          const configured = hasKey(k.id)
          const label = custom ? '自定义' : (fromFile ? '官方（默认）' : (configured ? '已配置' : '未配置'))
          const cls = custom ? 'custom' : (configured ? 'ok' : '')
          return `
            <div class="key-row">
              <div>
                <div class="key-label">${esc(k.label)}</div>
                <div class="key-desc">${esc(k.desc)}</div>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <span class="key-state ${cls}">${label}</span>
                <button class="btn btn-ghost btn-sm" data-key="${k.id}">设置</button>
              </div>
            </div>`
        }).join('')}
        <div class="field-hint" style="margin-top:12px">
          密钥优先级：设置页覆盖值 &gt; <span class="mono">src/js/config.js</span> 本地配置。设置页覆盖值存于本机 userData 目录，不会上传。高德密钥申请：<span class="mono">console.amap.com</span>
        </div>
      </div>

      <!-- 缓存 -->
      <div class="card">
        <div class="card-title">本地缓存</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px">
          <div>
            <div style="font-size:14px;font-weight:600">已占用 <span id="cache-size">${cacheSizeMB()}</span> MB</div>
            <div class="field-hint">包含路网 GeoJSON、开售时间表等数据缓存</div>
          </div>
          <button class="btn btn-ghost btn-sm btn-danger" id="btn-clear-cache" style="color:#fff">
            <i class="fas fa-trash"></i> 清除缓存
          </button>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:16px;padding-top:16px;border-top:0.5px solid var(--separator)">
          <div>
            <div style="font-size:14px;font-weight:600">最近查询车次</div>
            <div class="field-hint" id="history-info">${(s.searchHistory || []).length} 条记录</div>
          </div>
          <button class="btn btn-ghost btn-sm" id="btn-clear-history">
            <i class="fas fa-eraser"></i> 清空记录
          </button>
        </div>
      </div>

      <!-- 应用信息 -->
      <div class="card">
        <div class="card-title">应用信息</div>
        <table class="data-table">
          <tbody id="app-info"><tr><td colspan="2" class="text-secondary">读取中…</td></tr></tbody>
        </table>
      </div>
    </div>
  `

  // --- 布局 ---
  host.querySelectorAll('[data-layout]').forEach(el => {
    el.addEventListener('click', async () => {
      await saveSettings({ homeLayout: el.dataset.layout })
      toast('首页布局已更新', { icon: 'success' })
      render(host)
    })
  })
  host.querySelector('#btn-editor')?.addEventListener('click', () => navigate('custom-editor'))

  // --- API 源 ---
  host.querySelectorAll('[data-api]').forEach(el => {
    el.addEventListener('click', async () => {
      const v = el.dataset.api
      if (v === (s.apiSource || 'next')) return
      if (v === 'railgo') {
        const ok = await confirmDialog('RailGo API', '部分功能不支持 RailGo API，将使用新 API 作为备选数据源。确定切换吗？', { confirmText: '确定切换' })
        if (!ok) return
      }
      await saveSettings({ apiSource: v })
      toast('已切换数据源', { icon: 'success' })
      render(host)
    })
  })

  // --- 主题色 ---
  async function setTheme(color) {
    await saveSettings({ themeColor: color })
    applyTheme(color)
    render(host)
  }
  host.querySelectorAll('[data-color]').forEach(el => {
    el.addEventListener('click', () => setTheme(el.dataset.color))
  })

  const previewEl = host.querySelector('#picker-preview')
  const hexInput = host.querySelector('#hex-input')
  const sliders = {
    h: host.querySelector('#sl-h'),
    s: host.querySelector('#sl-s'),
    l: host.querySelector('#sl-l')
  }

  function syncPicker() {
    const hex = hslToHex(pickerHsl.h, pickerHsl.s, pickerHsl.l)
    if (previewEl) previewEl.style.background = hex
    if (hexInput) hexInput.value = hex
  }

  Object.entries(sliders).forEach(([k, el]) => {
    if (!el) return
    el.addEventListener('input', () => {
      pickerHsl[k] = Number(el.value)
      syncPicker()
    })
    el.addEventListener('change', () => setTheme(hslToHex(pickerHsl.h, pickerHsl.s, pickerHsl.l)))
  })

  host.querySelector('#btn-apply-hex')?.addEventListener('click', () => {
    const c = parseHex(hexInput.value)
    if (!c) { toastError('颜色格式不正确，应为 #RRGGBB'); return }
    setTheme(c)
  })
  hexInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') host.querySelector('#btn-apply-hex').click()
  })

  // --- 密钥 ---
  host.querySelectorAll('[data-key]').forEach(el => {
    el.addEventListener('click', () => editKey(el.dataset.key, host))
  })

  // --- 缓存 ---
  host.querySelector('#btn-clear-cache').addEventListener('click', async () => {
    const ok = await confirmDialog('清除缓存', '将清除路网地图、开售时间表等本地缓存数据，下次打开需重新下载。确定吗？', { danger: true, confirmText: '清除' })
    if (!ok) return
    const n = cacheClear()
    toast(`已清除 ${n} 项缓存`, { icon: 'success' })
    host.querySelector('#cache-size').textContent = cacheSizeMB()
  })

  host.querySelector('#btn-clear-history').addEventListener('click', async () => {
    const ok = await confirmDialog('清空查询记录', '将清除首页「最近查询」中的车次记录。确定吗？', { confirmText: '清空' })
    if (!ok) return
    await saveSettings({ searchHistory: [] })
    toast('查询记录已清空', { icon: 'success' })
    render(host)
  })

  // --- 恢复默认 ---
  host.querySelector('#btn-reset').addEventListener('click', async () => {
    const ok = await confirmDialog('恢复默认设置', '将重置主题色、首页布局、API 源与接口密钥。自定义卡片也会被清除。确定吗？', { danger: true, confirmText: '恢复默认' })
    if (!ok) return
    await resetSettings()
    applyTheme('#007aff')
    toast('已恢复默认设置', { icon: 'success' })
    render(host)
  })

  // --- 应用信息 ---
  loadAppInfo(host)
}

/** 与移动端一致：以主题色为基准的 6 档同色系 */
function tonePresetsOf(base) {
  const b = normalizeHex(base)
  return [
    shade(b, 0.45), shade(b, 0.25), b,
    tint(b, 0.25), tint(b, 0.45), tint(b, 0.62)
  ]
}

const PRESETS = [
  '#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de',
  '#5856d6', '#5ac8fa', '#ff2d55', '#00c7be', '#8e8e93'
]

async function loadAppInfo(host) {
  const el = host.querySelector('#app-info')
  if (!el) return
  let info = null
  try {
    if (window.native && window.native.app) info = await window.native.app.info()
  } catch (e) { /* ignore */ }

  const rows = [
    ['应用版本', info ? info.version : '1.1.0'],
    ['应用名称', info ? info.name : 'RailKale Next PC'],
    ['运行环境', info ? `Electron ${info.electron} · Chromium ${info.chrome}` : '浏览器'],
    ['Node.js', info ? info.node : '—'],
    ['系统', info ? `${info.platform} ${info.arch}` : navigator.platform],
    ['配置文件', info ? info.storePath : '（浏览器环境）']
  ]
  el.innerHTML = rows.map(([k, v]) => `
    <tr>
      <td style="color:var(--secondary);width:120px">${esc(k)}</td>
      <td class="mono" style="font-size:12.5px;word-break:break-all">${esc(v)}</td>
    </tr>
  `).join('')
}

async function editKey(keyId, host) {
  const def = KEY_DEFS.find(k => k.id === keyId)
  if (!def) return
  const s = getSettings()
  const current = (s.keys || {})[keyId]
  const isCustom = !!(current && current !== 'default' && current !== '')

  const wrap = document.createElement('div')
  wrap.innerHTML = `
    <div class="field">
      <label class="field-label">${esc(def.label)}</label>
      <input class="input" id="rk-key-input" placeholder="粘贴你的 API Key" value="${isCustom ? esc(current) : ''}" />
      <div class="field-hint">${esc(def.desc)}</div>
    </div>
  `

  let inputRef = null
  const result = await modal({
    title: '接口密钥 · ' + def.label,
    body: wrap,
    buttons: [
      { text: '使用官方默认', value: '__clear__' },
      { text: '取消', value: null },
      { text: '保存', primary: true, value: '__save__' }
    ],
    onMount: (bodyEl, close) => {
      inputRef = bodyEl.querySelector('#rk-key-input')
      inputRef.addEventListener('keydown', (e) => { if (e.key === 'Enter') close('__save__') })
    }
  })

  if (result === '__save__') {
    const val = inputRef ? inputRef.value.trim() : ''
    if (!val) { toastError('密钥不能为空'); return }
    if (val.length < 8) { toastError('密钥长度不足，请检查'); return }
    await saveSettings({ keys: { ...(getSettings().keys || {}), [keyId]: val } })
    toast(`${def.label} 已保存`, { icon: 'success' })
    if (hostRef) render(host)
  } else if (result === '__clear__') {
    await saveSettings({ keys: { ...(getSettings().keys || {}), [keyId]: 'default' } })
    toast(`${def.label} 已设为官方默认`, { icon: 'success' })
    if (hostRef) render(host)
  }
}

registerView('settings', {
  title: '设置',
  icon: 'fa-sliders-h',
  color: '#8e8e93',
  render,
  destroy() { hostRef = null }
})
