'use strict';

const assert = require('node:assert/strict');
const { before, test } = require('node:test');

let xml;
before(async () => {
  xml = await import('../xml/xml-engine.mjs');
});

test('enforces the XML input bound before parsing', () => {
  assert.throws(
    () => xml.assertXmlInput('x'.repeat(xml.XML_MAX_INPUT_CHARS + 1)),
    error => error.code === 'INPUT_TOO_LARGE'
  );
});

test('rejects internal and external DTDs before XML parsing', () => {
  for (const input of [
    '<!DOCTYPE root SYSTEM "https://example.invalid/external.dtd"><root/>',
    '<!DOCTYPE root [<!ENTITY local "value">]><root>&local;</root>',
  ]) {
    assert.throws(() => xml.assertNoDoctype(input), error => error.code === 'DOCTYPE_UNSUPPORTED');
  }
});

test('does not treat doctype-like text in comments, CDATA or processing instructions as DTDs', () => {
  assert.doesNotThrow(() => xml.assertNoDoctype(
    '<!-- <!DOCTYPE comment> --><root><![CDATA[<!DOCTYPE data>]]><?note <!DOCTYPE instruction?></root>'
  ));
});

test('reports DOCTYPE-like text in a quoted attribute as malformed XML', () => {
  const errorMarker = xmlElement('parsererror', [
    xmlElement('h3', [], { namespaceURI: XHTML_NAMESPACE }),
    xmlElement('div', [], { namespaceURI: XHTML_NAMESPACE }),
    xmlElement('h3', [], { namespaceURI: XHTML_NAMESPACE }),
  ], { namespaceURI: XHTML_NAMESPACE, textContent: 'This page contains the following errors:error on line 1 at column 15: malformed attribute value' });
  const malformedDocument = xmlDocument(xmlElement('root', [errorMarker]));
  assert.throws(
    () => xml.validateXml('<root attr="<!DOCTYPE x>"/>', parserPlatform(malformedDocument)),
    error => error.code === 'MALFORMED_XML'
  );
});

test('extracts parser locations without returning parser prose', () => {
  assert.deepEqual(xml.extractXmlErrorLocation('error on line 12 at column 7: mismatched tag'), { line: 12, column: 7 });
  assert.deepEqual(xml.extractXmlErrorLocation('XML Parsing Error: mismatched tag. Line Number 3, Column 9:'), { line: 3, column: 9 });
  assert.equal(xml.extractXmlErrorLocation('XML parsing failed.'), null);
});

test('rejects empty XML before parsing', () => {
  assert.throws(() => xml.assertXmlInput(' \n\t '), error => error.code === 'EMPTY_INPUT');
});

const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

function xmlElement(name, children = [], { namespaceURI = null, textContent = '', attributeCount = 0, attributeText = '', xmlSpace = '' } = {}) {
  const element = {
    nodeType: 1,
    nodeName: name,
    localName: name,
    namespaceURI,
    childNodes: children,
    children: children.filter(child => child.nodeType === 1),
    attributes: { length: attributeCount },
    textContent,
    attributeText,
    getAttributeNS: (_namespace, localName) => localName === 'space' ? xmlSpace : '',
    getAttribute: nameValue => nameValue === 'xml:space' ? xmlSpace : '',
    cloneNode: deep => xmlElement(name, deep ? [...children] : [], { namespaceURI, textContent, attributeCount, attributeText, xmlSpace }),
  };
  for (const child of children) child.parentNode = element;
  return element;
}

function xmlText(data) {
  return { nodeType: 3, data, childNodes: [], parentNode: null };
}

function escapeXmlText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

class FakeXMLSerializer {
  serializeToString(node) {
    if (node.nodeType === 9) return node.childNodes.map(child => this.serializeToString(child)).join('');
    if (node.nodeType === 1) {
      const start = `<${node.nodeName}${node.attributeText || ''}`;
      if (!node.childNodes.length) return `${start}/>`;
      return `${start}>${node.childNodes.map(child => this.serializeToString(child)).join('')}</${node.nodeName}>`;
    }
    if (node.nodeType === 3) return escapeXmlText(node.data);
    if (node.nodeType === 8) return `<!--${node.data}-->`;
    if (node.nodeType === 4) return `<![CDATA[${node.data}]]>`;
    if (node.nodeType === 7) return `<?${node.target} ${node.data}?>`;
    throw new Error('Unsupported test DOM node.');
  }
}

function xmlDocument(root) {
  const document = {
    nodeType: 9,
    documentElement: root,
    childNodes: [root],
    doctype: null,
    getElementsByTagName(name) {
      const found = [];
      const stack = [...this.childNodes];
      while (stack.length) {
        const node = stack.pop();
        if (node.localName === name) found.push(node);
        stack.push(...(node.childNodes || []));
      }
      return found;
    },
  };
  root.parentNode = document;
  return document;
}

function parserPlatform(document, Serializer = FakeXMLSerializer) {
  return {
    DOMParser: class FakeDOMParser {
      parseFromString(_source, contentType) {
        assert.equal(contentType, 'application/xml');
        return document;
      }
    },
    XMLSerializer: Serializer,
  };
}

test('formats nested XML with two-space indentation and keeps its declaration', () => {
  const child = xmlElement('child');
  const empty = xmlElement('empty');
  const root = xmlElement('root', [xmlText('\n  '), child, xmlText('\n  '), empty, xmlText('\n')]);
  const input = '<?xml version="1.0"?><root><child/><empty/></root>';
  const result = xml.formatXml(input, parserPlatform(xmlDocument(root)));
  assert.equal(result, '<?xml version="1.0"?>\n<root>\n  <child/>\n  <empty/>\n</root>');
});

test('keeps mixed-content elements inline instead of changing text spacing', () => {
  const bold = xmlElement('b', [xmlText('world')]);
  const paragraph = xmlElement('p', [xmlText('Hello '), bold, xmlText('!')]);
  const result = xml.formatXml('<p>Hello <b>world</b>!</p>', parserPlatform(xmlDocument(paragraph)));
  assert.equal(result, '<p>Hello <b>world</b>!</p>');
});

test('preserves whitespace when xml:space is preserve', () => {
  const child = xmlElement('child');
  const root = xmlElement('root', [xmlText('\n     '), child, xmlText('\n    ')], {
    attributeText: ' xml:space="preserve"',
    xmlSpace: 'preserve',
  });
  const input = '<root xml:space="preserve">\n     <child/>\n    </root>';
  assert.equal(xml.formatXml(input, parserPlatform(xmlDocument(root))), input);
});

test('preserves a byte-order mark and the XML declaration without adding a blank line', () => {
  const child = xmlElement('child');
  const root = xmlElement('root', [xmlText('\n'), child]);
  const input = '\uFEFF<?xml version="1.0"?><root><child/></root>';
  const expected = '\uFEFF<?xml version="1.0"?>\n<root>\n  <child/>\n</root>';
  assert.equal(xml.formatXml(input, parserPlatform(xmlDocument(root))), expected);
});

test('reparses formatted output and fails if serialization is not well-formed', () => {
  const original = xmlDocument(xmlElement('root'));
  const errorRoot = xmlElement('root');
  const errorMarker = xmlElement('parsererror', [
    xmlElement('h3', [], { namespaceURI: XHTML_NAMESPACE }),
    xmlElement('div', [], { namespaceURI: XHTML_NAMESPACE }),
    xmlElement('h3', [], { namespaceURI: XHTML_NAMESPACE }),
  ], { namespaceURI: XHTML_NAMESPACE, textContent: 'This page contains the following errors:error on line 1 at column 12: malformed output' });
  errorRoot.childNodes.push(errorMarker);
  errorRoot.children.push(errorMarker);
  errorMarker.parentNode = errorRoot;
  const parseErrorDocument = xmlDocument(errorRoot);
  let parseCalls = 0;
  const platform = {
    DOMParser: class SequencedParser {
      parseFromString() {
        parseCalls += 1;
        return parseCalls === 1 ? original : parseErrorDocument;
      }
    },
    XMLSerializer: class InvalidSerializer {
      serializeToString() { return '<root><broken></root>'; }
    },
  };
  assert.throws(() => xml.formatXml('<root/>', platform), error => error.code === 'SERIALIZE_ERROR');
  assert.equal(parseCalls, 2);
});

test('revalidates formatted output up to the separate output limit', () => {
  const document = xmlDocument(xmlElement('root'));
  const body = 'x'.repeat(xml.XML_MAX_INPUT_CHARS);
  class ExpandedSerializer {
    serializeToString() { return `<root>${body}</root>`; }
  }
  const output = xml.formatXml('<root/>', parserPlatform(document, ExpandedSerializer));
  assert.ok(output.length > xml.XML_MAX_INPUT_CHARS);
  assert.ok(output.length <= xml.XML_MAX_OUTPUT_CHARS);
  assert.ok(output.startsWith('<root>x') && output.endsWith('</root>'));
});

test('bounds formatted output independently of input size', () => {
  const document = xmlDocument(xmlElement('root'));
  class LargeSerializer {
    serializeToString() { return `<root>${'x'.repeat(500_001)}</root>`; }
  }
  assert.throws(
    () => xml.formatXml('<root/>', parserPlatform(document, LargeSerializer)),
    error => error.code === 'OUTPUT_TOO_LARGE'
  );
});

test('validates one XML document and returns its root name', () => {
  const document = xmlDocument(xmlElement('configuration'));
  assert.deepEqual(xml.validateXml('<configuration/>', parserPlatform(document)), { rootName: 'configuration' });
});

test('rejects XML trees deeper than the documented nesting limit', () => {
  const root = xmlElement('node');
  let parent = root;
  for (let level = 1; level <= xml.XML_MAX_DEPTH; level += 1) {
    const child = xmlElement('node');
    parent.childNodes.push(child);
    parent.children.push(child);
    child.parentNode = parent;
    parent = child;
  }
  assert.throws(() => xml.validateXml('<node/>', parserPlatform(xmlDocument(root))), error => error.code === 'DEPTH_LIMIT');
});

test('counts XML attributes toward the node budget', () => {
  const root = xmlElement('root', [], { attributeCount: xml.XML_MAX_NODES });
  assert.throws(() => xml.validateXml('<root/>', parserPlatform(xmlDocument(root))), error => error.code === 'NODE_LIMIT');
});

test('accepts legitimate XHTML elements named parsererror', () => {
  const root = xmlElement('root', [], { namespaceURI: XHTML_NAMESPACE });
  const userElement = xmlElement('parsererror', [
    xmlElement('h3', [], { namespaceURI: XHTML_NAMESPACE }),
    xmlElement('div', [], { namespaceURI: XHTML_NAMESPACE }),
    xmlElement('h3', [], { namespaceURI: XHTML_NAMESPACE }),
  ], { namespaceURI: XHTML_NAMESPACE, textContent: 'Custom parsererror content supplied by the XML document.' });
  root.childNodes.push(userElement);
  root.children.push(userElement);
  userElement.parentNode = root;
  const source = '<root xmlns="http://www.w3.org/1999/xhtml"><parsererror><h3>custom</h3><div>data</div><h3>more</h3></parsererror></root>';
  assert.deepEqual(xml.validateXml(source, parserPlatform(xmlDocument(root))), { rootName: 'root' });
});

test('rejects parser errors with localized-safe source coordinates', () => {
  const root = xmlElement('root');
  const parserError = xmlElement('parsererror', [
    xmlElement('h3', [], { namespaceURI: XHTML_NAMESPACE }),
    xmlElement('div', [], { namespaceURI: XHTML_NAMESPACE }),
    xmlElement('h3', [], { namespaceURI: XHTML_NAMESPACE }),
  ], {
    namespaceURI: XHTML_NAMESPACE,
    textContent: 'This page contains the following errors:error on line 2 at column 4: mismatched tag',
  });
  root.childNodes.push(parserError);
  root.children.push(parserError);
  parserError.parentNode = root;
  const document = xmlDocument(root);
  assert.throws(() => xml.validateXml('<root><child></root>', parserPlatform(document)), error => (
    error.code === 'MALFORMED_XML'
    && error.line === 2
    && error.column === 4
    && !error.message.includes('mismatched tag')
  ));
});

test('registers XML as a private local tool with bilingual related tools and JavaScript checks', () => {
  const { findTool, RELATED_TOOLS } = require('../shared/tools-data.js');
  const tool = findTool('xml');
  assert.equal(tool.recordRecent, false);
  assert.equal(tool.name.en, 'XML Formatter');
  assert.equal(tool.name.zh, 'XML 格式化与校验工具');
  assert.deepEqual(RELATED_TOOLS.xml, ['json', 'yaml', 'text-diff']);
  const packageJson = require('../package.json');
  assert.match(packageJson.scripts['check:js'], /xml\/xml-engine\.mjs/);
  assert.match(packageJson.scripts['check:js'], /xml\/xml-tool\.mjs/);
  assert.match(packageJson.scripts['check:js'], /xml\/xml-app\.mjs/);
});
