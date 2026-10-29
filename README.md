# 铁路万花筒 · RailKale: Next — PC 桌面版

基于 **[RailKaleNext](https://github.com/Laide140/RailKaleNext)**（uni-app 移动端，v1.1.0）移植的 **Electron 桌面应用**，
界面按桌面场景重新设计：左侧导航 + 宽屏多列布局 + 粘性信息侧栏，功能与移动端一一对应。

> 数据来源与移动端一致，仅供个人学习参考，请以 **铁路 12306 官方** 为准。

---

## 快速开始

```bash
npm install          # 安装依赖（Electron + electron-builder）

# 国内网络若卡在 Electron 二进制下载，使用镜像：
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install

npm start            # 启动应用
npm run dev          # 启动 + 打开开发者工具
```

### 打包

```bash
npm run pack         # 免安装目录（release/）
npm run dist         # 当前平台安装包
npm run dist:win     # Windows (NSIS + 便携版)
npm run dist:mac     # macOS (DMG)
npm run dist:linux   # Linux (AppImage + deb)
```

**产物命名**

| 平台 | 文件 |
| --- | --- |
| Windows | `RailKale-Next-1.1.0-win-setup.exe`（安装版）/ `...-win-portable.exe`（便携版） |
| macOS | `RailKale-Next-1.1.0-arm64.dmg` |
| Linux | `RailKale-Next-1.1.0.AppImage` / `.deb` |

**图标**：`build/` 下已备好三平台图标（`icon.ico` / `icon.icns` / `icon.png`），均源自同一张品牌图。

**跨平台注意**：`node_modules` 里的 Electron 是平台专属二进制，**必须在目标平台上打包**。换平台时只拷源码重新 `npm install`：
要拷 `main.js preload.js src/ build/ package.json package-lock.json README.md .gitignore`；不用拷 `node_modules/ release/ .electron-cache/`。

---

## 功能对照（已同步至移动端 v1.1.0）

移动端全部功能均已移植，并按桌面端习惯做了适配：

### 出行服务

| 功能 | 移动端 | 桌面端改动 |
| --- | --- | --- |
| **车次详情** 🆕 | 三个标签页：时刻 / 运行 / 列车 | 分步渲染（哪个接口先回先显示哪块）；时刻页左列表 + 右粘性信息卡（停台、检票口、车组、快捷跳转）；运行页地图并排；列车页三栏网格 + 车厢图横向滚动放大 |
| **车次查询** | 按站查询车次 + 余票 | 响应式多列网格；车次卡片底部直接提供「车次详情 / 时刻表」两个入口 |
| **时刻表** | 停靠站与到发时刻 | 竖向时间线，可复制时刻 |
| **实时位置** | 2 秒轮询 + 车组担当号 | 地图与信息并排；车组号改走自有数据源（不再依赖 rail.re） |
| **列车雷达** 🆕 | web-view 内嵌网页 + `document.title` 通信 | **原生重写**：高德 JS 地图常驻，按视野取周边城市车站 → 大屏汇总车次 → 查实时位置 → 地图打点；点击标记看车次信息，可调 30 秒自动刷新 |
| **定位测速** | 高德地图 + canvas 轨迹 | 去高德依赖，Canvas 等距投影自绘，离线可用 |

### 车站服务

| 功能 | 说明 | 桌面端改动 |
| --- | --- | --- |
| **车站大屏** | 到发信息（车次 / 状态 / 检票口） | 深色大屏表格 + 自动刷新 |
| **检票口** | 自有接口 + 12306 官方并行查询 | 双卡片并排 |
| **交通查询** | 地铁 / 公交 / 出租 / 停车场接驳 | 分类 Tab + 多列卡片 |
| **车站代码** | 电报码 / 拼音 / 缩写 | 3359 条数据表格化，全字段搜索 |
| **站台规模** | 站台数与到发线数 | 大字展示 + 常用车站一键查询 |
| **开售时间** 🆕 | 全国车站每日起售时间（3149 条） | **表格化**：全字段搜索 + 路局筛选 + 时间/站名/路局排序 +「只看已改名」+ 滚动追加 300 行/批 + 一键复制结果；本地缓存一周 |

### 实用工具

| 功能 | 说明 | 桌面端改动 |
| --- | --- | --- |
| **运用担当** | 车次 ↔ 车组号 | 改用自有数据源 `/api/v3/emu`，**支持按日期查询**（与移动端一致）；结果可点击互跳 |
| **算路器** 🆕 | 两站最短走行线路（CRTrainRoute） | 左侧参数粘性卡（起终点 / 目标里程 / 整段·微调精度），右侧距离摘要 + 全线走向静态图 + 途经车站表（可筛选、复制里程/坐标）；带等待计时提示（冷启动可到 30 秒） |
| **路网地图** | 全国铁路 GeoJSON 图层 | 高德全屏地图，按需下载省级数据并缓存 |
| **纪念车票** | 生成票据图片 | 左侧表单 + 右侧固定预览，保存到磁盘 |
| **行程车票** 🆕 | 为运转行程出票 | 行程信息卡 + 票据参数，出票播放「打印机吐票」动画 |
| **列车广播** | 讯飞 / 百度双音源 | 预置广播语，可调速 |
| **铁路大数据** 🆕 | 移动端为「开发中」占位 | 占位说明 + 规划指标 + 已有数据入口，不留死链 |
| **运转分享** 🆕 | 行程记录卡片（左滑删除） | **响应式卡片网格**，删除按钮直接上卡；添加行程用居中模态双列表单（可调车次候选）；支持导出 `.travel` 文件 |

### 系统

| 功能 | 说明 |
| --- | --- |
| **设置** | 首页布局 / API 源 / 主题色（同色系预设 + HSL 调色器）/ 接口密钥 / 缓存与查询记录 / 应用信息 |
| **关于** | 版本、当前状态、功能总览、数据来源、外链 |

另含移动端的**自定义主页编辑器**：卡片增删改、功能添加、主题色与背景图。

---

## 目录结构

```
├── main.js                    # Electron 主进程（窗口、IPC、配置持久化）
├── preload.js                 # contextBridge 白名单 API
├── src/
│   ├── index.html             # 应用外壳（含 CSP）
│   ├── css/
│   │   ├── app.css            # 桌面端设计系统（变量 + 组件 + 响应式）
│   │   └── fontawesome.css    # 精简版 Font Awesome
│   ├── assets/                # 字体与应用图标
│   ├── js/
│   │   ├── index.js           # 入口：注册视图后启动
│   │   ├── app.js             # 应用外壳（侧边栏 / 标题栏 / 启动流程）
│   │   ├── router.js          # 视图注册表与路由
│   │   ├── api.js             # API 服务层（v3 双 base + 三数据源 + 自动回退）
│   │   ├── settings.js        # 设置持久化（IPC → userData JSON）+ 缓存 + 查询记录
│   │   ├── keys.js            # 接口密钥解析与优先级
│   │   ├── color.js           # 颜色工具（HSL↔HEX / 调色板）
│   │   ├── travel.js          # 运转分享行程数据层
│   │   ├── ticketNo.js        # 纪念车票票号自增
│   │   ├── amap.js            # 高德 JS API 加载器（多地图视图共用）
│   │   ├── station.js         # 车站电报码 ↔ 中文名互转
│   │   ├── features.js        # 功能与分区数据源
│   │   ├── ui.js              # Toast / Modal / 确认框 / 选择列表
│   │   └── util.js            # 日期、剪贴板、文件保存、HSL↔HEX 等
│   └── views/                 # 26 个视图（含隐藏的详情页与编辑器）
└── package.json
```

---

## 与移动端的关键差异

1. **`file://` 下 localStorage 不可用**
   移动端用 `uni.setStorageSync` 存设置；桌面端改走 **IPC → `userData/railkalenext-config.json`**。
   行程（`.travel`）、票号等体量小的数据走 localStorage（Electron 下可用），路网 GeoJSON 走缓存层并做能力探测。

2. **列车雷达不再用 web-view**
   移动端靠内嵌 `railway-map.html` + `document.title` 传数据；桌面端直接在高德 JS 地图上绘制标记，
   扫描逻辑改为「视野内城市 → 主要车站 → 大屏车次 → 实时位置」，无跨域与通信脆弱点。

3. **定位测速脱离高德**
   改为 Canvas 等距投影自绘，不消耗密钥额度。

4. **算路器加了等待反馈**
   接口冷启动实测可达 30 秒，桌面端显示「已等待 N 秒」，避免误以为卡死。

5. **`history.replaceState` 在 `file://` 受限**
   路由改用 `location.hash` 同步。

---

## 配置说明

### 接口密钥

密钥分三层，**优先级：设置页覆盖值 > `src/js/config.js` > `keys.js` 内建默认值**。

| 密钥 | 用途 |
| --- | --- |
| 高德地图 · Web服务 | 实时位置 / 线路图的静态地图 |
| 高德地图 · JS API | 路网地图、列车雷达加载 |
| 高德地图 · JS安全码 | 路网地图 / 雷达的安全密钥 |

> 未配置时，地图相关功能显示占位提示，其余功能不受影响。

### API 源

| 源 | BaseURL | 说明 |
| --- | --- | --- |
| 新（默认） | `https://next.laide.net.cn/api/v3` | 短名端点；车次/余票/路网索引仍走 `/api` |
| 旧 | `https://rail.laide.asia/api` | 兼容旧接口 |
| RailGo | `rg-api.zenglingkun.cn/api/v2` | 仅车站大屏 / 检票口 / 线路图，其余自动回退新源 |

服务端 v3 端点归属见 `src/js/api.js` 的 `V3_PATH` 表；未列入的端点自动落到 `/api`。

### 数据源

- 主接口：`next.laide.net.cn/api/v3`
- 车组资料：`next.laide.net.cn/12306/train`
- 地图：高德地图 · 检票口官方：中国铁路 12306

---

## 开发说明

### 新增一个功能页

1. 新建 `src/views/xxx.js`，调用 `registerView('xxx', { title, icon, color, render })`
2. 在 `src/js/index.js` 中 `import '../views/xxx.js'`（副作用导入）
3. 在 `src/js/features.js` 的 `FEATURES` 增加条目，并加入某个 `SECTIONS` 的 `features`

### 视图接口

```js
registerView('path', {
  title: '页面标题',        // 显示在导航高亮
  icon: 'fa-train',        // Font Awesome 类名
  color: '#007aff',
  hidden: false,           // true 则不进入侧边栏（如详情页）
  render(host, params) {},  // host 是已挂载到内容区的 .view 容器
  onEnter(params) {},       // 进入前调用（可用于接收跳转参数）
  destroy() {}              // 离开时调用（清理定时器、地图实例等）
})
```

### 主题色

所有组件使用 `var(--theme)` / `var(--theme-text)` / `var(--theme-soft)` 等变量，由 `applyTheme()` 写入。
**语义色不要主题化**：车站大屏的状态色、铁路地图的红/蓝线路、报警红等是信息本身。

### 新增图标

`src/css/fontawesome.css` 是精简版，只收录实际用到的图标。需新图标时从 Font Awesome 6 官方 CSS 拷贝对应规则，字体文件已包含全部字形。

---

## 已知限制

1. **高德密钥需自行申请**：`console.amap.com`。未配置时地图相关功能降级。
2. **`/api/v3/lineTrains` 当前不可用**（上游依赖第三方、对方正在调整）。列车雷达改用「大屏汇总车次」的替代路径，不依赖该端点。
3. **路网地图首次加载较慢**：全国数据约 169MB，已缓存的省份自动跳过。
4. **算路器冷启动慢**：首次请求可能 10–30 秒，服务端有缓存后后续请求会快很多。
5. **定位测速依赖系统定位**：桌面端精度取决于系统定位服务，无定位硬件时不可用。
6. **铁路大数据仅为占位页**：与上游一致，正式功能尚未上线。

---

## 免责声明

仅供个人学习参考使用，完全免费。数据可能存在延迟或误差，请以 **铁路 12306 官方** 为准。

原移动端项目：[Laide140/RailKaleNext](https://github.com/Laide140/RailKaleNext)
