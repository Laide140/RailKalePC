/**
 * RailKale: Next PC - Electron 主进程
 *
 * 职责：
 *  - 创建桌面窗口（无边框自绘标题栏，可用系统控制按钮）
 *  - 配置 CSP / 权限（定位、麦克风无需、摄像头无需）
 *  - 提供 IPC：配置持久化、系统信息、外部链接、窗口控制
 */

const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const isDev = process.argv.includes('--dev')

// ---------------------------------------------------------------------------
// 配置持久化（等价于移动端 uni.getStorageSync / setStorageSync）
//
// 注意：app.getPath('userData') 必须在 app ready 之后调用，
// 否则会抛 "Failed to get 'userData' path"。因此这里延迟解析并缓存。
// ---------------------------------------------------------------------------
let storeFileCache = null

function storeFile() {
  if (!storeFileCache) {
    storeFileCache = path.join(app.getPath('userData'), 'railkalenext-config.json')
  }
  return storeFileCache
}

const DEFAULT_SETTINGS = {
	homeLayout: 'card',
	themeColor: '#007aff',
	apiSource: 'next',
	customCards: [],
	keys: {}
}

function readStore() {
	try {
		const raw = fs.readFileSync(storeFile(), 'utf8')
		const data = JSON.parse(raw)
		return data && typeof data === 'object' ? data : {}
	} catch (e) {
		return {}
	}
}

function writeStore(data) {
	try {
		fs.mkdirSync(path.dirname(storeFile()), { recursive: true })
		fs.writeFileSync(storeFile(), JSON.stringify(data, null, 2), 'utf8')
		return true
	} catch (e) {
		console.error('[store] 写入失败', e)
		return false
	}
}

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------
let mainWindow = null

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 960,
		minHeight: 640,
		show: false,
		backgroundColor: '#f2f2f7',
		titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
		trafficLightPosition: { x: 14, y: 16 },
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
			spellcheck: false
		}
	})

	mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'))

	mainWindow.once('ready-to-show', () => {
		mainWindow.show()
		if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
	})

	// 外部链接交给系统浏览器；http(s) 之外一律拦截
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//i.test(url)) shell.openExternal(url)
		return { action: 'deny' }
	})
	mainWindow.webContents.on('will-navigate', (event, url) => {
		if (!url.startsWith('file://')) {
			event.preventDefault()
			if (/^https?:\/\//i.test(url)) shell.openExternal(url)
		}
	})

	mainWindow.on('closed', () => { mainWindow = null })
}

// 单实例
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
	app.quit()
} else {
	app.on('second-instance', () => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore()
			mainWindow.focus()
		}
	})

	app.whenReady().then(() => {
		createWindow()
		app.on('activate', () => {
			if (BrowserWindow.getAllWindows().length === 0) createWindow()
		})
	})

	app.on('window-all-closed', () => {
		if (process.platform !== 'darwin') app.quit()
	})
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('store:getAll', () => ({ ...DEFAULT_SETTINGS, ...readStore() }))

ipcMain.handle('store:set', (_e, patch) => {
	const next = { ...readStore(), ...(patch || {}) }
	writeStore(next)
	return { ...DEFAULT_SETTINGS, ...next }
})

ipcMain.handle('store:reset', () => {
	writeStore({})
	return { ...DEFAULT_SETTINGS }
})

ipcMain.handle('store:path', () => storeFile())

ipcMain.handle('app:info', () => ({
	version: app.getVersion(),
	name: app.getName(),
	electron: process.versions.electron,
	chrome: process.versions.chrome,
	node: process.versions.node,
	platform: process.platform,
	arch: process.arch,
	storePath: storeFile()
}))

ipcMain.handle('shell:openExternal', (_e, url) => {
	if (/^https?:\/\//i.test(String(url || ''))) {
		shell.openExternal(url)
		return true
	}
	return false
})

ipcMain.handle('window:control', (_e, action) => {
	if (!mainWindow) return false
	if (action === 'minimize') mainWindow.minimize()
	else if (action === 'maximize') {
		if (mainWindow.isMaximized()) mainWindow.unmaximize()
		else mainWindow.maximize()
	} else if (action === 'close') mainWindow.close()
	return true
})

ipcMain.handle('window:isMaximized', () => !!(mainWindow && mainWindow.isMaximized()))

ipcMain.handle('dialog:saveFile', async (_e, { defaultPath, dataUrl }) => {
	try {
		const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, { defaultPath })
		if (canceled || !filePath) return { ok: false }
		const base64 = String(dataUrl).replace(/^data:[^;]+;base64,/, '')
		fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
		return { ok: true, filePath }
	} catch (err) {
		return { ok: false, error: String(err && err.message ? err.message : err) }
	}
})

ipcMain.handle('dialog:saveBinary', async (_e, { defaultPath, base64 }) => {
	try {
		const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, { defaultPath })
		if (canceled || !filePath) return { ok: false }
		fs.writeFileSync(filePath, Buffer.from(String(base64), 'base64'))
		return { ok: true, filePath }
	} catch (err) {
		return { ok: false, error: String(err && err.message ? err.message : err) }
	}
})

ipcMain.handle('theme:set', (_e, mode) => {
	nativeTheme.themeSource = mode === 'dark' ? 'dark' : (mode === 'light' ? 'light' : 'system')
	return nativeTheme.shouldUseDarkColors
})
