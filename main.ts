// Tiny stack VM (ISA: kit program/generator/subject/ISA.md). One run answers
// every /input/<id> into /output/<id>/{stdout.bin,exit.txt}.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const LIM = 65536;
function run(p: Uint8Array, inp: Uint8Array): [Uint8Array, number] {
  const n = p.length, st = new Int32Array(256), cs = new Int32Array(64), mm = new Int32Array(256), out = new Uint8Array(LIM);
  let sp = 0, cp = 0, ol = 0, ip = 0, pc = 0, steps = 0;
  const end = (c: number): [Uint8Array, number] => [out.slice(0, ol), c];
  for (;;) {
    if (steps === 1e6) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = p[pc];
    let im = 0, pops = 0, push = 0;
    if (op === 0x01) { im = 1; push = 1; }
    else if (op === 0x02) { im = 4; push = 1; }
    else if (op === 0x03) pops = 1;
    else if (op === 0x04) { pops = 1; push = 2; }
    else if (op === 0x05) { pops = 2; push = 2; }
    else if (op === 0x06) { pops = 2; push = 3; }
    else if (op === 0x07) { pops = 3; push = 3; }
    else if (op >= 0x10 && op <= 0x22 && op !== 0x17 && op !== 0x1b) { pops = 2; push = 1; }
    else if (op === 0x17 || op === 0x1b) { pops = 1; push = 1; }
    else if (op >= 0x30 && op <= 0x33) { im = 2; if (op === 0x31 || op === 0x32) pops = 1; }
    else if (op === 0x40) { pops = 1; push = 1; }
    else if (op === 0x41) pops = 2;
    else if (op === 0x50 || op === 0x51 || op === 0x53) pops = 1;
    else if (op === 0x52) push = 1;
    else if (op !== 0x00 && op !== 0x34) return end(5);
    if (pc + im >= n) return end(9);
    steps++;
    const nx = pc + 1 + im;
    if (sp < pops) return end(2);
    if (sp - pops + push > 256) return end(3);
    pc = nx;
    switch (op) {
      case 0x00: return end(0);
      case 0x01: st[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 0x02: st[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: st[sp] = st[sp - 1]; sp++; break;
      case 0x05: { const t = st[sp - 1]; st[sp - 1] = st[sp - 2]; st[sp - 2] = t; break; }
      case 0x06: st[sp] = st[sp - 2]; sp++; break;
      case 0x07: { const a = st[sp - 3]; st[sp - 3] = st[sp - 2]; st[sp - 2] = st[sp - 1]; st[sp - 1] = a; break; }
      case 0x17: st[sp - 1] = (-st[sp - 1]) | 0; break;
      case 0x1b: st[sp - 1] = ~st[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        const b = st[sp - 1], a = st[sp - 2];
        let r: number;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (!b) return end(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (op === 0x14) { if (!b) return end(4); r = b === -1 ? 0 : (a % b) | 0; }
        else if (op === 0x15) { if (!b) return end(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (!b) return end(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; st[sp++] = r;
        break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 0x30) { const v = st[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 0x33:
        if (cp === 64) return end(7);
        cs[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 0x34:
        if (!cp) return end(8);
        pc = cs[--cp];
        break;
      case 0x40: {
        const a = st[sp - 1];
        if (a < 0 || a >= 256) return end(6);
        st[sp - 1] = mm[a];
        break;
      }
      case 0x41: {
        const a = st[sp - 1], v = st[sp - 2];
        if (a < 0 || a >= 256) return end(6);
        sp -= 2; mm[a] = v;
        break;
      }
      case 0x50: {
        const t = String(st[sp - 1]);
        if (ol + t.length > LIM) return end(11);
        sp--;
        for (let i = 0; i < t.length; i++) out[ol++] = t.charCodeAt(i);
        break;
      }
      case 0x51:
        if (ol + 1 > LIM) return end(11);
        out[ol++] = st[--sp] & 255;
        break;
      case 0x52: st[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: return end(st[--sp] & 255);
    }
  }
}
for (const id of readdirSync(I).sort()) {
  const d = join(I, id);
  let prog: Uint8Array, inp: Uint8Array;
  try { prog = readFileSync(join(d, 'program.bin')); } catch { continue; }
  try { inp = readFileSync(join(d, 'input.bin')); } catch { inp = new Uint8Array(0); }
  const [o, c] = run(prog, inp);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), o);
  writeFileSync(join(O, id, 'exit.txt'), c + '\n');
}
