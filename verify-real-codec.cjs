// Independent check: the shipped package must decode and recreate real MV saves.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const LZ = require('./app/node_modules/lz-string');
const baseline = require('./output/report.json');
const results = [];
for (const entry of baseline.saves) {
  const bytes = fs.readFileSync(path.join(baseline.game, 'save', entry.name));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256, 'Original save changed');
  const encoded = bytes.toString('utf8').trim();
  const json = LZ.decompressFromBase64(encoded);
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'output', entry.name + '.json'), 'utf8'));
  assert.deepEqual(JSON.parse(json), expected, entry.name);
  const compressed = LZ.compress(json);
  const packed = Buffer.alloc(compressed.length * 2);
  for (let i=0;i<compressed.length;i++) packed.writeUInt16BE(compressed.charCodeAt(i),i*2);
  assert.equal(packed.toString('base64'), encoded, entry.name + ' codec mismatch');
  results.push({file:entry.name, compatible:true, originalUnchanged:true});
}
fs.writeFileSync(path.join(__dirname, 'output', 'production-codec-check.json'), JSON.stringify(results,null,2));
console.log(`PASS: ${results.length} real files match the bundled codec and original hashes.`);
