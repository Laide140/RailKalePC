/**
 * RailKale: Next PC - 列车广播
 * 文本转语音，支持讯飞 / 百度双音源
 */

import { registerView } from '../js/router.js'
import { getTrainBroadcastUrl, getBaiduTtsUrl } from '../js/api.js'
import { escapeHTML } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

const PRESETS = [
  { label: '广铁U彩', text: '广铁U彩提示您，前方到站是：广州南站，请下车的乘客提前做好下车准备。' },
  { label: '抢铁U彩', text: '叮咚，抢铁U彩吓死您，前方到站是：抢州南站。请下车的乘客配合我们抢钱。' },
  { label: '十八号线', text: '本次列车终点站为，万顷沙。下一站，番禺广场。' },
  { label: '进站广播', text: '各位旅客，由北京南开往上海虹桥的G1次列车现在开始检票，请乘坐该次列车的旅客到2号检票口检票进站。' },
  { label: '到站广播', text: '旅客们，前方到站是上海虹桥站，请下车的旅客提前做好准备，携带好您的行李物品，从列车前进方向的右侧车门下车。' },
  { label: '安全提示', text: '各位旅客，为了您和他人的安全，请勿在车厢内吸烟，请勿将行李物品放置在车厢通道处，谢谢您的配合。' }
]

let state = { text: '', source: 'xunfei', playing: false, loading: false, status: '', isError: false }
let audio = null
let hostRef = null

function esc(s) { return escapeHTML(s) }

function stopAudio() {
  if (audio) {
    try { audio.pause(); audio.src = '' } catch (e) { /* ignore */ }
    audio = null
  }
  state.playing = false
}

function render(host) {
  hostRef = host
  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:${state.source === 'baidu' ? '#2932e1' : '#007aff'}"><i class="fas fa-bullhorn"></i></div>
        <div>
          <div class="page-title">列车广播</div>
          <div class="page-subtitle">模拟车站及列车语音播报（讯飞 / 百度双音源）</div>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">音源</div>
        <div class="tabs" style="max-width:300px;margin-bottom:18px">
          <div class="tab ${state.source === 'xunfei' ? 'active' : ''}" data-src="xunfei">讯飞</div>
          <div class="tab ${state.source === 'baidu' ? 'active' : ''}" data-src="baidu">百度</div>
        </div>

        <div class="card-title">快捷用语</div>
        <div class="preset-pills">
          ${PRESETS.map((p, i) => `<button class="preset-pill" data-preset="${i}">${esc(p.label)}</button>`).join('')}
        </div>

        <div class="field">
          <label class="field-label">广播内容（最多 500 字）</label>
          <textarea class="input" id="f-text" rows="6" maxlength="500"
                    placeholder="输入广播内容…">${esc(state.text)}</textarea>
          <div class="field-hint"><span id="char-count">${state.text.length}</span>/500</div>
        </div>

        <div style="display:flex;align-items:center;gap:16px;margin-top:6px">
          <button class="play-btn ${state.playing ? 'playing' : ''}" id="btn-play" ${!state.text.trim() || state.loading ? 'disabled' : ''}>
            <i class="fas ${state.loading ? 'fa-spinner fa-spin' : (state.playing ? 'fa-stop' : 'fa-play')}"></i>
          </button>
          <div style="display:flex;align-items:center;gap:8px">
            ${state.status
              ? `<span class="pulse-dot" style="${state.isError ? 'background:var(--red);animation:none' : (state.playing ? '' : 'background:var(--tertiary);animation:none')}"></span>
                 <span style="font-size:13.5px;font-weight:500;color:${state.isError ? 'var(--red)' : 'var(--secondary)'}">${esc(state.status)}</span>`
              : ''}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">说明</div>
        <div style="font-size:13px;color:var(--secondary);line-height:1.85">
          <p style="margin-bottom:10px"><b style="color:var(--label)">讯飞音源</b>：调用自有接口 <span class="mono" style="font-size:11.5px">next.laide.net.cn/api/getXiaoYanTTS</span>，语音自然，支持语速与音调参数。</p>
          <p style="margin-bottom:10px"><b style="color:var(--label)">百度音源</b>：调用百度翻译 TTS 接口，作为备用音源。</p>
          <p style="margin-bottom:10px"><b style="color:var(--label)">使用方式</b>：选择音源 → 点击快捷用语或自行输入 → 点击圆形播放按钮试听。</p>
          <p><b style="color:var(--label)">提示</b>：需要网络连接；播放在本地进行，不会上传你的文本到本机以外的日志。</p>
        </div>
      </div>
    </div>
  `

  const textEl = host.querySelector('#f-text')
  const playBtn = host.querySelector('#btn-play')
  const charCount = host.querySelector('#char-count')

  function paintStatus() {
    if (hostRef !== host) return
    const playIcon = playBtn.querySelector('i')
    playIcon.className = 'fas ' + (state.loading ? 'fa-spinner fa-spin' : (state.playing ? 'fa-stop' : 'fa-play'))
    playBtn.classList.toggle('playing', state.playing)
    playBtn.disabled = !state.text.trim() || state.loading
  }

  async function startPlay() {
    if (!state.text.trim()) return
    stopAudio()
    state.loading = true
    state.isError = false
    state.status = '请求中…'
    render(host)

    try {
      const url = state.source === 'xunfei'
        ? getTrainBroadcastUrl(state.text.trim())
        : getBaiduTtsUrl(state.text.trim())

      audio = new Audio(url)
      audio.crossOrigin = 'anonymous'

      audio.addEventListener('playing', () => {
        state.loading = false
        state.playing = true
        state.isError = false
        state.status = '播放中'
        if (hostRef === host) render(host)
      })
      audio.addEventListener('ended', () => {
        state.playing = false
        state.status = '播放完毕'
        if (hostRef === host) render(host)
        setTimeout(() => {
          if (!state.playing && !state.isError) { state.status = ''; if (hostRef === host) render(host) }
        }, 2000)
      })
      audio.addEventListener('error', () => {
        state.loading = false
        state.playing = false
        state.isError = true
        state.status = '播放失败'
        toastError('音频加载失败，可尝试切换音源')
        if (hostRef === host) render(host)
      })

      await audio.play()
    } catch (e) {
      console.error('TTS 请求失败', e)
      state.loading = false
      state.isError = true
      state.status = '请求失败'
      if (hostRef === host) render(host)
    }
  }

  function togglePlay() {
    if (state.playing) {
      stopAudio()
      state.status = '已停止'
      setTimeout(() => { if (!state.playing) { state.status = ''; if (hostRef === host) render(host) } }, 1200)
      render(host)
    } else {
      startPlay()
    }
  }

  host.querySelectorAll('[data-src]').forEach(el => {
    el.addEventListener('click', () => {
      stopAudio()
      state.source = el.dataset.src
      state.status = ''
      render(host)
    })
  })
  host.querySelectorAll('[data-preset]').forEach(el => {
    el.addEventListener('click', () => {
      state.text = PRESETS[Number(el.dataset.preset)].text
      render(host)
    })
  })
  textEl.addEventListener('input', () => {
    state.text = textEl.value
    charCount.textContent = state.text.length
    paintStatus()
  })
  playBtn.addEventListener('click', togglePlay)

  paintStatus()
}

registerView('train-broadcast', {
  title: '列车广播',
  icon: 'fa-bullhorn',
  color: '#007aff',
  render,
  destroy() { stopAudio(); hostRef = null }
})
