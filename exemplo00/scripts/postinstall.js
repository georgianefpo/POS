// Corrige o @tensorflow/tfjs-node no Windows + Node 24.
// Rodado automaticamente pelo npm apos cada install (ver "postinstall" no package.json).
// Dois problemas conhecidos, ambos aplicados de forma idempotente:
//   1) tfjs-node nao copia a tensorflow.dll para junto do binding no Windows -> ERR_DLOPEN_FAILED.
//   2) Node 22+/24 removeu util.isNullOrUndefined, que o tfjs-node 4.22 ainda usa -> TypeError.
const fs = require('fs');
const path = require('path');

const pkg = path.join(__dirname, '..', 'node_modules', '@tensorflow', 'tfjs-node');
if (!fs.existsSync(pkg)) {
  return; // tfjs-node nao instalado; nada a fazer.
}

// 1) Copia a tensorflow.dll para o mesmo diretorio do binding.
if (process.platform === 'win32') {
  const src = path.join(pkg, 'deps', 'lib', 'tensorflow.dll');
  const dst = path.join(pkg, 'lib', 'napi-v8', 'tensorflow.dll');
  if (fs.existsSync(src) && !fs.existsSync(dst)) {
    fs.copyFileSync(src, dst);
    console.log('postinstall: tensorflow.dll copiada para lib/napi-v8');
  }
}

// 2) Injeta shim para util.isNullOrUndefined no ponto de entrada do tfjs-node.
const indexPath = path.join(pkg, 'dist', 'index.js');
if (fs.existsSync(indexPath)) {
  const original = fs.readFileSync(indexPath, 'utf8');
  const marker = 'isNullOrUndefined-shim';
  if (!original.includes(marker)) {
    const shim = '/* ' + marker + ' */ (function(){var u=require("util");'
      + 'if(typeof u.isNullOrUndefined!=="function"){'
      + 'u.isNullOrUndefined=function(v){return v===null||v===undefined;};}'
      + 'if(typeof u.isNull!=="function"){u.isNull=function(v){return v===null;};}'
      + 'if(typeof u.isUndefined!=="function"){u.isUndefined=function(v){return v===undefined;};}})();\n';
    // Preserva a diretiva "use strict" como primeira instrucao, se existir.
    const useStrict = /^(\s*["']use strict["'];?\s*)/;
    const patched = useStrict.test(original)
      ? original.replace(useStrict, (m) => m + shim)
      : shim + original;
    fs.writeFileSync(indexPath, patched);
    console.log('postinstall: shim util.isNullOrUndefined injetado no tfjs-node');
  }
}
