/**
 * Generate simple PNG icons using pure JavaScript (no external deps)
 * Creates a basic monitor icon
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Simple PNG encoder (minimal implementation)
function createPNG(width, height, pixels) {
  // PNG signature
  const signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  
  // IHDR chunk
  const ihdr = createIHDR(width, height);
  
  // IDAT chunk (image data)
  const idat = createIDAT(width, height, pixels);
  
  // IEND chunk
  const iend = createIEND();
  
  return Buffer.concat([
    Buffer.from(signature),
    ihdr,
    idat,
    iend
  ]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type);
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function createIHDR(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data.writeUInt8(8, 8);   // bit depth
  data.writeUInt8(6, 9);   // color type (RGBA)
  data.writeUInt8(0, 10);  // compression
  data.writeUInt8(0, 11);  // filter
  data.writeUInt8(0, 12);  // interlace
  return createChunk('IHDR', data);
}

function createIDAT(width, height, pixels) {
  // Add filter byte (0 = None) before each row
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      rawData.push(pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3]);
    }
  }
  
  // Compress using zlib (Node.js built-in)
  const compressed = deflateSync(Buffer.from(rawData), { level: 9 });
  
  return createChunk('IDAT', compressed);
}

function createIEND() {
  return createChunk('IEND', Buffer.alloc(0));
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xffffffff;
  const table = makeCRCTable();
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCRCTable() {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

// Draw simple monitor icon
function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  
  const bgColor = [0x1a, 0x1a, 0x2e, 0xff];
  const screenColor = [0x16, 0x21, 0x3e, 0xff];
  const accentColor = [0x60, 0xa5, 0xfa, 0xff];
  const grayColor = [0x4a, 0x56, 0x68, 0xff];
  
  // Fill background with rounded corners
  const cornerRadius = size * 0.16;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      
      // Check if inside rounded rect
      let inside = true;
      if (x < cornerRadius && y < cornerRadius) {
        inside = Math.sqrt((cornerRadius - x) ** 2 + (cornerRadius - y) ** 2) <= cornerRadius;
      } else if (x >= size - cornerRadius && y < cornerRadius) {
        inside = Math.sqrt((x - (size - cornerRadius)) ** 2 + (cornerRadius - y) ** 2) <= cornerRadius;
      } else if (x < cornerRadius && y >= size - cornerRadius) {
        inside = Math.sqrt((cornerRadius - x) ** 2 + (y - (size - cornerRadius)) ** 2) <= cornerRadius;
      } else if (x >= size - cornerRadius && y >= size - cornerRadius) {
        inside = Math.sqrt((x - (size - cornerRadius)) ** 2 + (y - (size - cornerRadius)) ** 2) <= cornerRadius;
      }
      
      if (inside) {
        pixels.set(bgColor, idx);
      } else {
        pixels.set([0, 0, 0, 0], idx); // transparent
      }
    }
  }
  
  // Draw monitor screen
  const screenLeft = size * 0.16;
  const screenTop = size * 0.25;
  const screenRight = size * 0.84;
  const screenBottom = size * 0.65;
  const screenRadius = size * 0.03;
  
  for (let y = Math.floor(screenTop); y < Math.floor(screenBottom); y++) {
    for (let x = Math.floor(screenLeft); x < Math.floor(screenRight); x++) {
      const idx = (y * size + x) * 4;
      pixels.set(screenColor, idx);
    }
  }
  
  // Draw stand
  const standLeft = size * 0.42;
  const standRight = size * 0.58;
  const standTop = size * 0.65;
  const standBottom = size * 0.75;
  
  for (let y = Math.floor(standTop); y < Math.floor(standBottom); y++) {
    for (let x = Math.floor(standLeft); x < Math.floor(standRight); x++) {
      const idx = (y * size + x) * 4;
      pixels.set(grayColor, idx);
    }
  }
  
  // Draw base
  const baseLeft = size * 0.33;
  const baseRight = size * 0.67;
  const baseTop = size * 0.75;
  const baseBottom = size * 0.80;
  
  for (let y = Math.floor(baseTop); y < Math.floor(baseBottom); y++) {
    for (let x = Math.floor(baseLeft); x < Math.floor(baseRight); x++) {
      const idx = (y * size + x) * 4;
      pixels.set(grayColor, idx);
    }
  }
  
  // Draw clock circle
  const cx = size * 0.5;
  const cy = size * 0.45;
  const radius = size * 0.12;
  const lineWidth = size * 0.02;
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist >= radius - lineWidth && dist <= radius + lineWidth) {
        const idx = (y * size + x) * 4;
        pixels.set(accentColor, idx);
      }
    }
  }
  
  // Draw clock hands
  // Hour hand (pointing up)
  for (let y = Math.floor(cy - radius); y < Math.floor(cy); y++) {
    for (let dx = -lineWidth; dx <= lineWidth; dx++) {
      const x = Math.floor(cx + dx);
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const idx = (y * size + x) * 4;
        pixels.set(accentColor, idx);
      }
    }
  }
  
  // Minute hand (pointing right)
  for (let x = Math.floor(cx); x < Math.floor(cx + radius); x++) {
    for (let dy = -lineWidth; dy <= lineWidth; dy++) {
      const y = Math.floor(cy + dy);
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const idx = (y * size + x) * 4;
        pixels.set(accentColor, idx);
      }
    }
  }
  
  return pixels;
}

// Generate icons
const iconsDir = join(__dirname, '..', 'public', 'icons');

const icon192 = createPNG(192, 192, drawIcon(192));
writeFileSync(join(iconsDir, 'icon-192.png'), icon192);
console.log('Created icon-192.png');

const icon512 = createPNG(512, 512, drawIcon(512));
writeFileSync(join(iconsDir, 'icon-512.png'), icon512);
console.log('Created icon-512.png');
