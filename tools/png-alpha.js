'use strict';

/**
 * Minimal RGBA PNG alpha reader: `zlib` plus a PNG scanline unfilter is enough
 * for the assets this project writes with Pillow, and it keeps the tooling free
 * of image dependencies.
 *
 * @module png-alpha
 */

const fs = require('fs');
const zlib = require('zlib');

/**
 * @param {string} file - PNG path.
 * @returns {{width: number, height: number, alpha: Uint8Array}} the alpha plane.
 */
function readAlpha(file) {
  const buffer = fs.readFileSync(file);
  let offset = 8;
  const idat = [];
  let width = 0;
  let height = 0;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = 4;
  const stride = width * channels;
  const alpha = new Uint8Array(width * height);
  const line = new Uint8Array(stride);
  const previous = new Uint8Array(stride);
  let position = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[position];
    position += 1;
    for (let x = 0; x < stride; x++) {
      const value = raw[position + x];
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      let out;
      switch (filter) {
        case 0:
          out = value;
          break;
        case 1:
          out = value + left;
          break;
        case 2:
          out = value + up;
          break;
        case 3:
          out = value + ((left + up) >> 1);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          out = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          throw new Error(`unsupported PNG filter ${String(filter)}`);
      }
      line[x] = out & 0xff;
    }
    position += stride;
    for (let x = 0; x < width; x++) alpha[y * width + x] = line[x * channels + 3];
    previous.set(line);
  }
  return { width, height, alpha };
}

module.exports = { readAlpha };
