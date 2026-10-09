'use strict';

import * as engine from './sql-engine.mjs';
import { attachSqlTool } from './sql-tool.mjs';

attachSqlTool(engine);
