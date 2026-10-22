// The box (tools/boxes.json) the committed js/sf-geodata.js was built for: the data tests read data/*-<box>.bin to match
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const head = readFileSync(join(__dirname, '../../js/sf-geodata.js'), 'utf8').slice(0, 300);
module.exports = { BOX: /\(box "([^"]+)"\)/.exec(head)[1] };
