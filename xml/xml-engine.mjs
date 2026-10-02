'use strict';

export const XML_MAX_INPUT_CHARS = 250_000;
export const XML_MAX_NODES = 20_000;
export const XML_MAX_DEPTH = 100;
export const XML_MAX_OUTPUT_CHARS = 500_000;

export class XmlToolError extends Error {
  constructor(code, message, line = null, column = null) {
    super(message);
    this.name = 'XmlToolError';
    this.code = code;
    this.line = line;
    this.column = column;
  }
}

function assertInput(input, maxChars = XML_MAX_INPUT_CHARS, limitCode = 'INPUT_TOO_LARGE') {
  if (typeof input !== 'string') throw new XmlToolError('INPUT_INVALID', 'Input must be XML text.');
  if (input.length > maxChars) {
    const subject = limitCode === 'OUTPUT_TOO_LARGE' ? 'Formatted XML' : 'Input';
    throw new XmlToolError(limitCode, `${subject} exceeds ${maxChars.toLocaleString('en-US')} characters.`);
  }
  if (input.trim() === '') throw new XmlToolError('EMPTY_INPUT', 'Enter one XML document first.');
}

function skipDelimited(source, start, terminator) {
  const end = source.indexOf(terminator, start);
  return end === -1 ? source.length : end + terminator.length;
}

function skipTag(source, start) {
  let quote = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '<') return index;
    if (character === '>') return index + 1;
  }
  return source.length;
}

export function assertNoDoctype(source) {
  if (typeof source !== 'string') throw new XmlToolError('INPUT_INVALID', 'Input must be XML text.');
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      index = skipDelimited(source, index + 4, '-->');
      continue;
    }
    if (source.startsWith('<![CDATA[', index)) {
      index = skipDelimited(source, index + 9, ']]>');
      continue;
    }
    if (source.startsWith('<?', index)) {
      index = skipDelimited(source, index + 2, '?>');
      continue;
    }
    if (source.startsWith('<!DOCTYPE', index) && /\s/u.test(source[index + 9] || '')) {
      throw new XmlToolError('DOCTYPE_UNSUPPORTED', 'Document type declarations are not supported.');
    }
    if (source[index] === '<') {
      const end = skipTag(source, index);
      if (end !== index) {
        index = end;
        continue;
      }
    }
    index += 1;
  }
}

export function assertXmlInput(input, maxChars = XML_MAX_INPUT_CHARS, limitCode = 'INPUT_TOO_LARGE') {
  assertInput(input, maxChars, limitCode);
  assertNoDoctype(input);
}

export function extractXmlErrorLocation(parserText) {
  if (typeof parserText !== 'string') return null;
  const match = parserText.match(/\bline(?:\s+number)?\s+(\d+)\D+?column\s+(\d+)/iu);
  if (!match) return null;
  const line = Number(match[1]);
  const column = Number(match[2]);
  return Number.isSafeInteger(line) && line > 0 && Number.isSafeInteger(column) && column > 0
    ? { line, column }
    : null;
}

const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const MOZ_PARSERERROR_NAMESPACE = 'http://www.mozilla.org/newlayout/xml/parsererror.xml';

function parserErrorNode(document) {
  if (typeof document.getElementsByTagName !== 'function') return null;
  for (const node of Array.from(document.getElementsByTagName('parsererror'))) {
    if (node.namespaceURI === MOZ_PARSERERROR_NAMESPACE) return node;
    if (node.namespaceURI !== XHTML_NAMESPACE || node.parentNode !== document.documentElement) continue;
    const names = Array.from(node.children || []).map(child => child.localName);
    const chromiumErrorText = /^This page contains the following errors:\s*error on line\s+\d+\s+at column\s+\d+:/iu.test(node.textContent || '');
    if (names.length === 3 && names[0] === 'h3' && names[1] === 'div' && names[2] === 'h3' && chromiumErrorText) return node;
  }
  return null;
}

function checkTreeBudget(document) {
  const stack = Array.from(document.childNodes || [], node => ({ node, depth: node.nodeType === 1 ? 1 : 0 }));
  let nodeCount = 1;
  while (stack.length) {
    const { node, depth } = stack.pop();
    nodeCount += 1;
    if (nodeCount > XML_MAX_NODES) throw new XmlToolError('NODE_LIMIT', `Document exceeds ${XML_MAX_NODES.toLocaleString('en-US')} nodes.`);
    if (node.nodeType === 10) throw new XmlToolError('DOCTYPE_UNSUPPORTED', 'Document type declarations are not supported.');
    if (node.nodeType === 1) {
      if (depth > XML_MAX_DEPTH) throw new XmlToolError('DEPTH_LIMIT', `Document exceeds the ${XML_MAX_DEPTH}-level nesting limit.`);
      nodeCount += node.attributes?.length || 0;
      if (nodeCount > XML_MAX_NODES) throw new XmlToolError('NODE_LIMIT', `Document exceeds ${XML_MAX_NODES.toLocaleString('en-US')} nodes.`);
    }
    const childDepth = node.nodeType === 1 ? depth + 1 : depth;
    for (const child of Array.from(node.childNodes || [])) stack.push({ node: child, depth: childDepth });
  }
}

function parseDocument(input, platform = {}, checkBudget = true, inputLimit = {}) {
  const { maxChars = XML_MAX_INPUT_CHARS, limitCode = 'INPUT_TOO_LARGE' } = inputLimit;
  assertXmlInput(input, maxChars, limitCode);
  const Parser = platform.DOMParser || globalThis.DOMParser;
  if (typeof Parser !== 'function') throw new XmlToolError('PLATFORM_UNAVAILABLE', 'This browser does not provide an XML parser.');
  let document;
  try {
    document = new Parser().parseFromString(input, 'application/xml');
  } catch {
    throw new XmlToolError('MALFORMED_XML', 'The XML document is not well-formed.');
  }
  const errorNode = parserErrorNode(document);
  if (errorNode) {
    const location = extractXmlErrorLocation(errorNode.textContent);
    throw new XmlToolError('MALFORMED_XML', 'The XML document is not well-formed.', location?.line ?? null, location?.column ?? null);
  }
  if (!document?.documentElement) throw new XmlToolError('MALFORMED_XML', 'The XML document is not well-formed.');
  if (document.doctype) throw new XmlToolError('DOCTYPE_UNSUPPORTED', 'Document type declarations are not supported.');
  if (checkBudget) checkTreeBudget(document);
  return document;
}

export function validateXml(input, platform = {}) {
  const document = parseDocument(input, platform);
  return { rootName: document.documentElement.nodeName };
}

function findTagEnd(markup) {
  let quote = '';
  for (let index = 1; index < markup.length; index += 1) {
    const character = markup[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  throw new XmlToolError('SERIALIZE_ERROR', 'The XML document could not be formatted safely.');
}

function formatElement(element, serializer, depth, inheritedPreserve = false) {
  const children = Array.from(element.childNodes || []);
  const space = element.getAttributeNS?.('http://www.w3.org/XML/1998/namespace', 'space')
    || element.getAttribute?.('xml:space')
    || '';
  const preserve = space === 'preserve' || (space !== 'default' && inheritedPreserve);
  const hasElementChildren = children.some(node => node.nodeType === 1);
  const hasSignificantText = children.some(node => (node.nodeType === 3 && node.data.trim() !== '') || node.nodeType === 4);
  if (preserve || !hasElementChildren || hasSignificantText) return serializer.serializeToString(element);

  const shallow = serializer.serializeToString(element.cloneNode(false));
  const opening = shallow.slice(0, findTagEnd(shallow) + 1).replace(/\/\s*>$/u, '>');
  const lines = [];
  for (const child of children) {
    if (child.nodeType === 3 && child.data.trim() === '') continue;
    const content = child.nodeType === 1 ? formatElement(child, serializer, depth + 1, preserve) : serializer.serializeToString(child);
    lines.push(`${'  '.repeat(depth + 1)}${content}`);
  }
  return `${opening}\n${lines.join('\n')}\n${'  '.repeat(depth)}</${element.nodeName}>`;
}

export function formatXml(input, platform = {}) {
  const document = parseDocument(input, platform);
  const Serializer = platform.XMLSerializer || globalThis.XMLSerializer;
  if (typeof Serializer !== 'function') throw new XmlToolError('PLATFORM_UNAVAILABLE', 'This browser does not provide an XML serializer.');
  const serializer = new Serializer();
  const bom = input.startsWith('\uFEFF') ? '\uFEFF' : '';
  const declarationMatch = input.slice(bom.length).match(/^<\?xml(?=[\t\n\r ])[\s\S]*?\?>/u);
  const declaration = declarationMatch ? declarationMatch[0] : '';
  const pieces = [];
  for (const node of Array.from(document.childNodes || [])) {
    if (node.nodeType === 3 && node.data.trim() === '') continue;
    pieces.push(node.nodeType === 1 ? formatElement(node, serializer, 0) : serializer.serializeToString(node));
  }
  const body = pieces.join('\n');
  const prefix = `${bom}${declaration}${declaration ? '\n' : ''}`;
  const formatted = `${prefix}${body}`;
  if (formatted.length > XML_MAX_OUTPUT_CHARS) {
    throw new XmlToolError('OUTPUT_TOO_LARGE', `Formatted XML exceeds ${XML_MAX_OUTPUT_CHARS.toLocaleString('en-US')} characters.`);
  }
  try {
    parseDocument(formatted, platform, false, { maxChars: XML_MAX_OUTPUT_CHARS, limitCode: 'OUTPUT_TOO_LARGE' });
  } catch {
    throw new XmlToolError('SERIALIZE_ERROR', 'The formatter output did not pass XML validation.');
  }
  return formatted;
}
