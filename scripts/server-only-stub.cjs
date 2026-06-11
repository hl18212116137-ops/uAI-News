/** 供 tsx 脚本在 Next 外运行：跳过 server-only 包 */
const Module = require('module')
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') {
    return {}
  }
  return originalLoad.apply(this, arguments)
}
