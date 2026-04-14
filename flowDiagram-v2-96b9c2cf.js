import { f as flowDb, p as parser$1 } from "./flowDb-956e92f1.js";
import { f as flowStyles, a as flowRendererV2 } from "./styles-c10674c1.js";
import { x as setConfig } from "./index.js";
import "./graph.js";
import "./layout.js";
import "./agent-dashboard.js";
import "./index-3862675e.js";
import "./clone.js";
import "./edges-e0da2a9e.js";
import "./createText-2e5e7dd3.js";
import "./line.js";
import "./array.js";
import "./path.js";
import "./channel.js";
const diagram = {
  parser: parser$1,
  db: flowDb,
  renderer: flowRendererV2,
  styles: flowStyles,
  init: (cnf) => {
    if (!cnf.flowchart) {
      cnf.flowchart = {};
    }
    cnf.flowchart.arrowMarkerAbsolute = cnf.arrowMarkerAbsolute;
    setConfig({ flowchart: { arrowMarkerAbsolute: cnf.arrowMarkerAbsolute } });
    flowRendererV2.setConf(cnf.flowchart);
    flowDb.clear();
    flowDb.setGen("gen-2");
  }
};
export {
  diagram
};
//# sourceMappingURL=flowDiagram-v2-96b9c2cf.js.map
