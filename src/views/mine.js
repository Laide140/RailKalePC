/**
 * RailKale: Next PC - 关于 / 我的
 */

import { registerView, navigate } from '../js/router.js'
import { FEATURES, SECTIONS, getFeature } from '../js/features.js'
import { getSettings, cacheSizeMB, getSearchHistory } from '../js/settings.js'
import { loadTravels } from '../js/travel.js'
import { peekTicketSeq } from '../js/ticketNo.js'
import { getKey } from '../js/keys.js'
import { escapeHTML, openExternal } from '../js/util.js'

let hostRef = null

function esc(s) { return escapeHTML(s) }

function render(host) {
  hostRef = host
  const s = getSettings()
  let appVersion = '1.1.0'
  if (window.native && window.native.app) {
    window.native.app.info().then(info => {
      const el = host.querySelector('#ver-badge')
      if (el && hostRef === host) el.textContent = 'v' + info.version
    }).catch(() => {})
  }

  const travels = loadTravels()

  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:linear-gradient(135deg,var(--theme),var(--theme-strong))">
          <i class="fas fa-train"></i>
        </div>
        <div>
          <div class="page-title">铁路万花筒 · RailKale: Next</div>
          <div class="page-subtitle">桌面版（Electron） · <span id="ver-badge">v${esc(appVersion)}</span></div>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:18px">
          <img src="assets/icons/avatar.png" style="width:64px;height:64px;border-radius:16px;box-shadow:0 4px 14px rgba(0,0,0,.2)" alt="logo" />
          <div>
            <div style="font-size:18px;font-weight:700">铁路万花筒</div>
            <div style="font-size:13px;color:var(--secondary)">RailKale: Next · PC</div>
            <div style="font-size:12.5px;color:var(--secondary);margin-top:3px">综合铁路信息查询工具</div>
          </div>
        </div>

        <div class="card-title">快捷入口</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn btn-ghost btn-sm" data-goto="settings"><i class="fas fa-sliders-h"></i> 设置</button>
          <button class="btn btn-ghost btn-sm" data-goto="operation-share"><i class="fas fa-camera-retro"></i> 运转分享</button>
          <button class="btn btn-ghost btn-sm" data-goto="sale-time"><i class="fas fa-clock"></i> 开售时间</button>
          <button class="btn btn-ghost btn-sm" data-goto="route-planner"><i class="fas fa-route"></i> 算路器</button>
          <button class="btn btn-ghost btn-sm" data-goto="custom-editor"><i class="fas fa-palette"></i> 自定义主页</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">当前状态</div>
        <table class="data-table">
          <tbody>
            <tr><td style="color:var(--secondary);width:120px">数据源</td>
                <td>${esc({ next: '新 (next.laide.net.cn/api/v3)', old: '旧 (rail.laide.asia)', railgo: 'RailGo' }[s.apiSource] || '新')}</td></tr>
            <tr><td style="color:var(--secondary)">首页布局</td>
                <td>${esc({ card: '分区卡片', grid: '宫格', custom: '自定义' }[s.homeLayout] || '分区卡片')}</td></tr>
            <tr><td style="color:var(--secondary)">主题色</td>
                <td><span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${esc(s.themeColor)};vertical-align:-2px;margin-right:7px"></span><span class="mono">${esc(s.themeColor)}</span></td></tr>
            <tr><td style="color:var(--secondary)">自定义卡片</td><td>${(s.customCards || []).length} 张</td></tr>
            <tr><td style="color:var(--secondary)">运转记录</td><td>${travels.length} 条行程</td></tr>
            <tr><td style="color:var(--secondary)">纪念车票</td><td>已出票 <span class="mono">A${String(peekTicketSeq()).padStart(6, '0')}</span></td></tr>
            <tr><td style="color:var(--secondary)">查询记录</td><td>${getSearchHistory().length} 条</td></tr>
            <tr><td style="color:var(--secondary)">本地缓存</td><td>${cacheSizeMB()} MB</td></tr>
            <tr><td style="color:var(--secondary)">高德密钥</td>
                <td>${getKey('amap') || getKey('amap_js') ? '<span style="color:var(--green)">已配置</span>' : '<span style="color:var(--orange)">未配置</span>'}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-title">功能一览 · ${FEATURES.filter(f => !isHidden(f)).length} 项</div>
        ${SECTIONS.map(sec => `
          <div style="margin-bottom:16px">
            <div style="font-size:13px;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:7px">
              <i class="fas ${sec.icon}" style="color:${sec.badgeColor}"></i>${esc(sec.title)}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:7px">
              ${sec.features.map(fid => {
                const f = getFeature(fid)
                if (!f) return ''
                return `<button class="btn btn-ghost btn-sm" data-goto="${esc(f.path)}">
                  <i class="fas ${esc(f.icon)}" style="color:${esc(f.color)}"></i>${esc(f.label)}</button>`
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <div class="card-title">数据来源</div>
        <table class="data-table">
          <tbody>
            <tr><td style="color:var(--secondary);width:150px">主数据接口</td>
                <td><span class="mono" style="font-size:12.5px">next.laide.net.cn/api/v3</span></td></tr>
            <tr><td style="color:var(--secondary)">兼容接口</td>
                <td><span class="mono" style="font-size:12.5px">rail.laide.asia/api</span></td></tr>
            <tr><td style="color:var(--secondary)">友商接口</td>
                <td><span class="mono" style="font-size:12.5px">rg-api.zenglingkun.cn</span></td></tr>
            <tr><td style="color:var(--secondary)">车组资料</td>
                <td><span class="mono" style="font-size:12.5px">next.laide.net.cn/12306/train</span></td></tr>
            <tr><td style="color:var(--secondary)">地图服务</td><td>高德地图</td></tr>
            <tr><td style="color:var(--secondary)">检票口官方</td><td>中国铁路 12306</td></tr>
          </tbody>
        </table>
        <div class="field-hint" style="margin-top:12px">
          数据可能存在延迟或误差，请以 <b>铁路 12306 官方</b> 为准。
        </div>
      </div>

      <div class="card">
        <div class="card-title">相关链接</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-ghost" style="justify-content:flex-start" data-url="https://next.laide.net.cn">
            <i class="fas fa-external-link-alt"></i> 项目官网 next.laide.net.cn</button>
          <button class="btn btn-ghost" style="justify-content:flex-start" data-url="https://github.com/Laide140/RailKaleNext">
            <i class="fas fa-external-link-alt"></i> GitHub 仓库 Laide140/RailKaleNext</button>
          <button class="btn btn-ghost" style="justify-content:flex-start" data-url="https://www.12306.cn">
            <i class="fas fa-external-link-alt"></i> 中国铁路 12306</button>
        </div>
      </div>
    </div>

    <div style="text-align:center;padding:34px 0;font-size:12px;color:var(--tertiary);line-height:1.9">
      <div>铁路万花筒 · RailKale: Next PC</div>
      <div>仅供个人学习参考使用，完全免费</div>
    </div>
  `

  host.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.goto))
  })
  host.querySelectorAll('[data-url]').forEach(el => {
    el.addEventListener('click', () => openExternal(el.dataset.url))
  })
}

/** 详情页类功能不进「功能一览」统计 */
function isHidden(f) {
  return f.id === 'travel-ticket'
}

registerView('mine', {
  title: '关于',
  icon: 'fa-user',
  color: '#8e8e93',
  render,
  destroy() { hostRef = null }
})
