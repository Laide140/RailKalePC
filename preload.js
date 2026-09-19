/**
 * RailKale: Next PC - preload
 * 只向渲染进程暴露白名单能力，保持 contextIsolation。
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('native', {
	// 配置持久化
	store: {
		getAll: () => ipcRenderer.invoke('store:getAll'),
		set: (patch) => ipcRenderer.invoke('store:set', patch),
		reset: () => ipcRenderer.invoke('store:reset'),
		path: () => ipcRenderer.invoke('store:path')
	},
	app: {
		info: () => ipcRenderer.invoke('app:info')
	},
	shell: {
		openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
	},
	window: {
		control: (action) => ipcRenderer.invoke('window:control', action),
		isMaximized: () => ipcRenderer.invoke('window:isMaximized')
	},
	dialog: {
		saveFile: (payload) => ipcRenderer.invoke('dialog:saveFile', payload),
		saveBinary: (payload) => ipcRenderer.invoke('dialog:saveBinary', payload)
	},
	theme: {
		set: (mode) => ipcRenderer.invoke('theme:set', mode)
	},
	isElectron: true,
	platform: process.platform
})
