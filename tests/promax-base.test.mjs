import fs from 'node:fs';
import assert from 'node:assert/strict';
const s = fs.readFileSync(new URL('../nodeseek-pro-max.user.js', import.meta.url), 'utf8');
assert.match(s, /\/\/ @version\s+1\.1\.5-cid4\n/);
assert.match(s, /\/\/ @downloadURL\s+https:\/\/scripts\.fengbujue\.com\/nodeseek\/nodeseek-pro-max\.user\.js\n/);
assert.match(s, /\/\/ @updateURL\s+https:\/\/scripts\.fengbujue\.com\/nodeseek\/nodeseek-pro-max\.meta\.js\n/);
// 1.1.5-cid1 的「打开预览」白底黑字样式
assert.ok(s.includes('.nsx-preview-toggle{position:absolute;top:6px;right:16px;z-index:2;box-sizing:border-box;min-width:68px;height:23px;padding:0 9px;color:#000!important;background:#fff!important;border:1px solid #ccc!important;'));
assert.ok(s.includes('.dark-layout .nsx-preview-toggle,.dark .nsx-preview-toggle,'));
assert.ok(!s.includes('.nsx-preview-toggle{position:absolute;top:6px;right:16px;z-index:2;box-sizing:border-box;min-width:68px;height:23px;padding:0 9px;color:#fff;background:#111'));
assert.ok(s.includes('"./features/replyStay.js": __vite_glob_0_cid_replyStay'));
console.log('ALL PROMAX BASE TESTS PASSED');
