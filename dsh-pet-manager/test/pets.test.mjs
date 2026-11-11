import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { makeSvg, sanitizeSvg, readLibrary, builtins } from '../src/pets.mjs';
const Parser = new JSDOM('').window.DOMParser;
test('all built-ins and template combinations produce accepted standalone SVG', () => {
  for (const kind of ['alpaca', 'cat', 'robot', 'drop']) for (const accessory of ['none', 'glasses', 'scarf']) assert.match(sanitizeSvg(makeSvg({ kind, accessory }), Parser), /viewBox="0 0 128 128"/);
  assert.equal(builtins.length, 4);
});
test('reject script, events, links, CSS references, XML entities and malformed SVG', () => {
  for (const value of ['<script>alert(1)</script>', '<foreignObject/>', '<image href="https://example.org/a.png"/>', '<path onload="alert(1)"/>', '<path style="fill:red"/>', '<path fill="url(https://example.org)"/>', '<use href="#x"/>', '<animate/>']) assert.throws(() => sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${value}</svg>`, Parser));
  for (const text of ['<!DOCTYPE svg><svg/>', '<svg>', '<html/>']) assert.throws(() => sanitizeSvg(text, Parser));
  assert.throws(() => makeSvg({ color: '"><script/>' }));
});
test('library rejects duplicate IDs, preserves archived pets and round trips exported pets', () => {
  const pet = { id: 'custom-1', name: '  云  ', svg: makeSvg(), archived: true };
  assert.equal(readLibrary(JSON.stringify([pet]))[0].archived, true);
  assert.equal(readLibrary(JSON.stringify([pet]))[0].name, '云');
  assert.throws(() => readLibrary(JSON.stringify([pet, pet])));
  assert.throws(() => readLibrary('{}'));
});
