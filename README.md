# 铁路万花筒 · RailKale: Next — PC 桌面版

基于 **[RailKaleNext](https://github.com/Laide140/RailKaleNext)**（uni-app 移动端）重写的 **Electron 桌面应用**，
界面按桌面场景重新设计：左侧导航 + 宽屏多列布局，功能与移动端一一对应。

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
| Windows | `RailKale-Next-1.0.0-win-setup.exe`（安装版）/ `...-win-portable.exe`（便携版） |
| macOS | `RailKale-Next-1.0.0-arm64.dmg` |
| Linux | `RailKale-Next-1.0.0.AppImage` / `.deb` |

**图标**

`build/` 目录下已备好三个平台的图标，均源自同一张品牌图：

| 文件 | 平台 | 说明 |
| --- | --- | --- |
| `icon.ico` | Windows | 7 个尺寸（16/24/32/48/64/128/256） |
| `icon.icns` | macOS | 16→1024 全尺寸 |
| `icon.png` | Linux | 1254×1254 源图 |

**跨平台注意事项**

1. **必须在目标平台上打包**。`node_modules` 里的 Electron 是平台专属二进制（darwin / win32 / linux 不通用），跨平台打包需要 wine，坑较多。换平台时**只拷源码，重新 `npm install`**：

   ```
   要拷：main.js  preload.js  src/  build/  package.json  package-lock.json  README.md  .gitignore
   不用拷：node_modules/  release/  .electron-cache/  .DS_Store
   ```

2. **macOS 签名**。`build.mac.identity` 已设为 `null`（跳过签名），否则会因连不上 Apple 时间戳服务而失败。若需正式分发，改回证书名并配置公证。

3. **Windows 安装位置**。`perMachine: true`，装到 `C:\Program Files\RailKale Next`（64 位），安装时需要管理员提权（`allowElevation: true`）。同时保留 `allowToChangeInstallationDirectory`，用户可自行改路径。

   > 注意：应用**用户数据**（设置、密钥覆盖值、路网缓存）始终写在 `%APPDATA%\railkalenextpc\`，与安装位置无关；卸载时不会删除（`deleteAppDataOnUninstall: false`）。

4. **网络慢时**可临时用镜像（Electron 二进制约 130MB）：

   ```bash
   ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install
   ```

---

## 功能对照

移动端 13 项功能已全部移植，并按桌面使用习惯做了适配：

| 分区 | 功能 | 桌面端改动 |
| --- | --- | --- |
| **出行服务** | 车次查询 | 车次卡片改为响应式多列网格，余票横排展示；结果页常驻、可反复查询 |
| | 时刻表 | 竖向时间线 + 到发双列对齐，新增「复制时刻」「跳转实时位置/线路图」 |
| | 实时位置 | 2 秒轮询不变，地图与信息并排显示；可手动停止追踪 |
| | 定位测速 | **去掉高德依赖**，改用 Canvas 等距投影自绘轨迹，离线可用 |
| **车站服务** | 车站大屏 | 深色大屏风格保留，改为可滚动表格 + 30 秒自动刷新开关 |
| | 检票口 | 自有接口 + 12306 官方**并行查询**，双卡片并排展示 |
| | 交通查询 | 分类 Tab + 多列接驳卡片 |
| | 车站代码 | 3359 条数据表格化，支持全字段搜索、一键复制电报码 |
| | 站台规模 | 去查询后大字展示，常用车站一键查询 |
| **实用工具** | 运用担当 | 车次/车组双模式，今日记录高亮 |
| | 路网地图 | 高德 JS API 全屏地图，**按需下载**省级 GeoJSON，可点击线路查询属性 |
| | 纪念车票 | 左侧表单 + 右侧固定预览，支持保存图片到磁盘 |
| | 列车广播 | 讯飞/百度双音源，预置 6 条广播语 |
| **系统** | 设置 | 首页布局 / 主题色 / API 源 / 接口密钥 / 缓存管理 |
| | 关于 | 应用信息、数据来源、功能总览、外链 |

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
│   │   └── fontawesome.css    # 精简版 Font Awesome（仅收录用到的 97 个图标）
│   ├── assets/
│   │   ├── fontawesome/       # 字体文件（离线可用）
│   │   └── icons/             # 应用图标
│   ├── js/
│   │   ├── index.js           # 入口：注册视图后启动
│   │   ├── app.js             # 应用外壳（侧边栏 / 标题栏 / 启动流程）
│   │   ├── router.js          # 视图注册表与路由（独立模块，避免循环依赖）
│   │   ├── api.js             # API 服务层（三数据源 + 自动回退）
│   │   ├── settings.js        # 设置持久化（IPC → userData JSON）+ 缓存层
│   │   ├── keys.js            # 接口密钥解析与优先级
│   │   ├── station.js         # 车站电报码 ↔ 中文名互转（带缓存）
│   │   ├── features.js        # 功能与分区数据源
│   │   ├── ui.js              # Toast / Modal / 确认框 / 选择列表
│   │   └── util.js            # 日期、距离、防抖、剪贴板、HSL↔HEX 等
│   └── views/                 # 19 个视图（含隐藏的详情页与编辑器）
└── package.json
```

---

## 与移动端的关键差异

这些不是"没做"，而是**平台不同导致的必要改动**：

1. **`file://` 下 localStorage 不可用**
   移动端用 `uni.setStorageSync` 存设置与路网缓存；桌面端改走 **IPC → `userData/railkalenext-config.json`**。
   路网 GeoJSON 因体积大（约 169MB）仍走 `localStorage`，并做了**能力探测**：
   不可用时降级为内存缓存并在界面明确提示，不会静默失败。

2. **路网地图按需加载**
   移动端一次性下载 33 个省级文件；桌面端在 WebView 内直接加载 GeoJSON，
   **点击「加载数据」才下载**，已缓存的省份自动跳过。线路按 `fclass` 着色（铁路/地铁/轻轨/隧道/桥梁），可点击查看线路名与属性。

3. **定位测速脱离高德**
   移动端的测速页依赖高德 JS API 绘制轨迹；桌面端改为 **Canvas 等距投影自绘**，
   不消耗密钥额度、不依赖地图服务，轨迹与速度计算逻辑保持一致。

4. **`history.replaceState` 在 `file://` 受限**
   路由改用 `location.hash` 同步，避免打包后抛 `SecurityError`。

5. **循环依赖消除**
   移动端视图直接 `import` store；桌面端把路由抽到独立的 `router.js`，
   让 19 个视图不再与应用外壳互相引用，模块图可被 esbuild 正常打包。

---

## 配置说明

### 接口密钥

高德密钥有 **3 项**，在「设置 → 接口密钥」中填写，存于本机 `userData` 目录：

| 密钥 | 用途 |
| --- | --- |
| 高德地图 · Web服务 | 实时位置 / 线路图的静态地图 |
| 高德地图 · JS API | 路网地图加载 |
| 高德地图 · JS安全码 | 路网地图安全密钥 |

> 未配置时，「实时位置」与「线路图」的静态地图会显示占位提示，其余功能不受影响。

### API 源

| 源 | BaseURL | 说明 |
| --- | --- | --- |
| 新（默认） | `https://next.laide.net.cn/api` | 覆盖全部端点 |
| 旧 | `https://rail.laide.asia/api` | 兼容旧接口 |
| RailGo | `rg-api.zenglingkun.cn/api/v2` | 仅车站大屏 / 检票口 / 线路图，其余自动回退到新源 |

### 数据源

- 主接口：`next.laide.net.cn/api`
- 动车组配属 / 交路：`api.rail.re`
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
  title: '页面标题',        // 显示在标题栏与导航高亮
  icon: 'fa-train',        // Font Awesome 类名
  color: '#007aff',
  hidden: false,           // true 则不进入侧边栏（如详情页、编辑器）
  render(host, params) {},  // host 是已挂载到内容区的 .view 容器
  onEnter(params) {},       // 进入前调用（可用于接收跳转参数）
  destroy() {}              // 离开时调用（清理定时器、地图实例等）
})
```

### 新增图标

`src/css/fontawesome.css` 是精简版，只收录实际用到的图标。
需要新图标时，从 Font Awesome 6 官方 CSS 中拷贝对应规则（含 unicode）加入即可，字体文件已包含全部字形。

---

## 已知限制

1. **高德密钥需自行申请**：`console.amap.com`。未配置时地图相关功能降级。
2. **路网地图首次加载较慢**：全国数据约 169MB，建议分批加载（按需下载已缓存的省份会自动跳过）。
3. **定位测速依赖系统定位**：桌面端精度取决于系统定位服务（Wi-Fi / GPS），无定位硬件时无法使用。
4. **纪念车票与列车广播依赖外部接口**：接口不可用时对应功能不可用。

---

## 免责声明

仅供个人学习参考使用，完全免费。数据可能存在延迟或误差，请以 **铁路 12306 官方** 为准。

原移动端项目：[Laide140/RailKaleNext](https://github.com/Laide140/RailKaleNext)
