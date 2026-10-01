'use strict';

import * as jsyaml from './vendor/js-yaml-5.4.2.mjs';

if (!jsyaml || typeof jsyaml.load !== 'function' || typeof jsyaml.dump !== 'function') {
  throw new Error('The local YAML parser module did not load.');
}

  const YAML_MAX_INPUT_CHARS = 250_000;
  const YAML_MAX_NODES = 20_000;
  const YAML_MAX_ALIASES = 64;
  const YAML_MAX_DEPTH = 100;

  class YamlToolError extends Error {
    constructor(code, message, line = null, column = null) {
      super(message);
      this.name = 'YamlToolError';
      this.code = code;
      this.line = line;
      this.column = column;
    }
  }

  function assertInput(input) {
    if (typeof input !== 'string') {
      throw new YamlToolError('INPUT_INVALID', 'Input must be text.');
    }
    if (input.length > YAML_MAX_INPUT_CHARS) {
      throw new YamlToolError('INPUT_TOO_LARGE', `Input exceeds the ${YAML_MAX_INPUT_CHARS.toLocaleString('en-US')} character limit.`);
    }
  }

  function checkNodeBudget(rootValue) {
    let nodeCount = 0;
    const stack = [{ node: rootValue, depth: 1 }];

    function isContainer(value) {
      if (Array.isArray(value)) return true;
      if (!value || typeof value !== 'object') return false;
      const prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    }

    function assertFiniteNumber(value) {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new YamlToolError('NON_FINITE_NUMBER', 'Non-finite numbers such as Infinity and NaN are not supported.');
      }
    }

    while (stack.length) {
      const { node, depth } = stack.pop();
      if (depth > YAML_MAX_DEPTH) {
        throw new YamlToolError('DEPTH_LIMIT', `Document exceeds the ${YAML_MAX_DEPTH}-level nesting limit.`);
      }
      assertFiniteNumber(node);
      if (!isContainer(node)) continue;
      for (const key in node) {
        if (!Object.hasOwn(node, key)) continue;
        if (++nodeCount > YAML_MAX_NODES) {
          throw new YamlToolError('NODE_LIMIT', `Document exceeds the ${YAML_MAX_NODES.toLocaleString('en-US')} value limit.`);
        }
        const value = node[key];
        assertFiniteNumber(value);
        if (isContainer(value)) stack.push({ node: value, depth: depth + 1 });
      }
    }
  }

  function yamlOptions() {
    return {
      schema: jsyaml.JSON_SCHEMA,
      maxDepth: YAML_MAX_DEPTH,
      maxAliases: YAML_MAX_ALIASES,
      maxTotalMergeKeys: 1_000
    };
  }

  function parseYaml(input) {
    assertInput(input);
    if (input.trim() === '') throw new YamlToolError('EMPTY_DOCUMENT', 'Enter one YAML document first.');

    let value;
    try {
      value = jsyaml.load(input, yamlOptions());
    } catch (error) {
      const mark = error && error.mark;
      const reason = error && error.reason ? error.reason : 'The YAML document could not be parsed.';
      throw new YamlToolError(
        'YAML_PARSE_ERROR',
        reason,
        mark && Number.isInteger(mark.line) ? mark.line + 1 : null,
        mark && Number.isInteger(mark.column) ? mark.column + 1 : null
      );
    }

    if (typeof value === 'undefined') throw new YamlToolError('EMPTY_DOCUMENT', 'Enter one YAML document first.');
    checkNodeBudget(value);
    return value;
  }

  function formatYaml(input) {
    const value = parseYaml(input);
    try {
      return jsyaml.dump(value, { schema: jsyaml.JSON_SCHEMA, lineWidth: 100, noRefs: false });
    } catch (error) {
      throw new YamlToolError('YAML_SERIALIZE_ERROR', 'This YAML structure cannot be safely formatted.');
    }
  }

  function yamlToJson(input) {
    const value = parseYaml(input);
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      throw new YamlToolError('YAML_SERIALIZE_ERROR', 'This YAML structure cannot be represented as JSON.');
    }
  }

  function jsonToYaml(input) {
    assertInput(input);
    let value;
    try {
      value = JSON.parse(input);
    } catch (error) {
      const position = Number(error.message.match(/position\s+(\d+)/i)?.[1]);
      let line = null;
      let column = null;
      if (Number.isInteger(position) && position >= 0) {
        const prefix = input.slice(0, position);
        const lines = prefix.split(/\r\n|\r|\n/);
        line = lines.length;
        column = lines[lines.length - 1].length + 1;
      }
      throw new YamlToolError('JSON_PARSE_ERROR', 'The JSON input is invalid.', line, column);
    }
    checkNodeBudget(value);
    try {
      return jsyaml.dump(value, { schema: jsyaml.JSON_SCHEMA, lineWidth: 100, noRefs: true });
    } catch (error) {
      throw new YamlToolError('YAML_SERIALIZE_ERROR', 'This JSON value could not be represented as YAML.');
    }
  }

export {
  YamlToolError,
  YAML_MAX_INPUT_CHARS,
  YAML_MAX_NODES,
  YAML_MAX_ALIASES,
  YAML_MAX_DEPTH,
  formatYaml,
  yamlToJson,
  jsonToYaml
};
