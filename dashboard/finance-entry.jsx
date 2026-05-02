import React from "react";
import ReactDOM from "react-dom/client";
import Finance from "./Finance.jsx";

const rootEl = document.getElementById("finance-root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(React.createElement(Finance));
}
