/* Simulador de AFD y AFND: todos los datos y algoritmos se ejecutan en el navegador. */
const automata = {
  afd: {
    title: "Autómata Finito Determinista", mark: "D",
    subtitle: "Una ruta para cada símbolo",
    description: "Desde cada estado existe exactamente una transición para cada símbolo del alfabeto. El recorrido es único y fácil de seguir.",
    language: "Termina en 1", alphabet: ["0", "1"], states: ["q0", "q1"], initial: "q0", finals: ["q1"],
    transitions: {
      q0: { "0": "q0", "1": "q1" },
      q1: { "0": "q0", "1": "q1" }
    },
    examples: { example: "1011", empty: "", accept: "1101", reject: "1010" },
    explanation: "Este AFD recuerda el último símbolo leído. q1 significa que la cadena termina en 1; q0 significa que está vacía o termina en 0."
  },
  afnd: {
    title: "Autómata Finito No Determinista", mark: "N",
    subtitle: "Varias rutas posibles",
    description: "Cada símbolo puede activar varios estados a la vez. Las transiciones ε cambian de estado sin consumir símbolos de la entrada.",
    language: "Contiene 01", alphabet: ["0", "1"], states: ["q0", "qE", "q1", "q2"], initial: "q0", finals: ["q2"],
    // q0 --ε--> qE; qE explora prefijos y puede elegir un 0 para entrar a q1.
    // q1 espera un 1 para alcanzar q2, el estado de aceptación absorbente.
    transitions: {
      q0: { "0": ["q0"], "1": ["q0"], "ε": ["qE"] },
      qE: { "0": ["q1"], "1": ["qE"], "ε": [] },
      q1: { "0": [], "1": ["q2"], "ε": [] },
      q2: { "0": ["q2"], "1": ["q2"], "ε": [] }
    },
    examples: { example: "11010", empty: "", accept: "0001", reject: "1110" },
    explanation: "q0 recorre cualquier prefijo. La ruta alternativa qE busca un 0, q1 espera un 1 y q2 confirma que se encontró 01. Una vez en q2, el patrón ya fue encontrado."
  }
};

// Para el AFND se muestra q0, q1 y q2: q0 hace de estado de exploración,
// q1 es el estado que espera el 1 y q2 es el estado de aceptación absorbente.
// El ε de q0 a q1 permite ilustrar cierre-ε; el camino de búsqueda del patrón
// también se mantiene mediante la transición q0 --0--> q1.
const ui = {
  tabs: [...document.querySelectorAll(".tab")],
  introMark: document.querySelector("#intro-mark"), typeKicker: document.querySelector("#type-kicker"),
  introTitle: document.querySelector("#intro-title"), introCopy: document.querySelector("#intro-copy"),
  language: document.querySelector("#language-label"), svg: document.querySelector("#automaton-svg"),
  select: document.querySelector("#example-select"), input: document.querySelector("#input-string"),
  start: document.querySelector("#start-btn"), step: document.querySelector("#step-btn"),
  play: document.querySelector("#play-btn"), reset: document.querySelector("#reset-btn"),
  speed: document.querySelector("#speed"), speedLabel: document.querySelector("#speed-label"),
  result: document.querySelector("#result-box"), resultSymbol: document.querySelector("#result-symbol"),
  resultTitle: document.querySelector("#result-title"), resultCopy: document.querySelector("#result-copy"),
  table: document.querySelector("#transition-table"), tableCaption: document.querySelector("#table-caption"),
  tableFootnote: document.querySelector("#table-footnote"), traceEmpty: document.querySelector("#trace-empty"),
  trace: document.querySelector("#trace-list"), counter: document.querySelector("#step-counter"),
  note: document.querySelector("#diagram-note")
};

let mode = "afd";
let run = null;
let playbackTimer = null;
let activeStates = new Set();
let activeEdge = null;
let trace = [];

function stopPlayback() {
  if (playbackTimer !== null) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  ui.play.innerHTML = "<span>▶</span> Reproducir";
}

function setResult(kind, title, message) {
  ui.result.className = `result-box ${kind}`;
  ui.resultSymbol.textContent = kind === "success" ? "✓" : kind === "failure" ? "×" : kind === "error" ? "!" : "i";
  ui.resultTitle.textContent = title;
  ui.resultCopy.textContent = message;
}

function currentAutomaton() { return automata[mode]; }
function isNFA() { return mode === "afnd"; }
function normalizeInput(value) { return value.trim(); }

function switchMode(nextMode) {
  stopPlayback();
  mode = nextMode;
  ui.tabs.forEach(tab => {
    const selected = tab.dataset.tab === mode;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  const a = currentAutomaton();
  ui.introMark.textContent = a.mark;
  ui.typeKicker.textContent = a.title.toUpperCase();
  ui.introTitle.textContent = a.subtitle;
  ui.introCopy.textContent = a.description;
  ui.language.textContent = a.language;
  ui.input.value = a.examples.example;
  ui.tableCaption.textContent = isNFA() ? "δ (estado, símbolo) → conjunto de estados" : "δ (estado, símbolo) → estado";
  ui.tableFootnote.textContent = isNFA()
    ? "En el AFND, ∅ significa que no hay transición; ε no consume ningún símbolo de la cadena."
    : "Cada estado tiene exactamente una transición para cada símbolo del alfabeto.";
  ui.note.textContent = isNFA()
    ? "Los estados azules están activos simultáneamente. El cierre ε se calcula al inicio y después de cada símbolo."
    : "La flecha indica dónde comienza el procesamiento. El doble círculo identifica el estado final.";
  resetSimulation();
  renderDiagram();
  renderTable();
}

function resetSimulation() {
  stopPlayback();
  run = null; trace = []; activeEdge = null;
  activeStates = new Set();
  ui.step.disabled = true; ui.play.disabled = true;
  ui.trace.replaceChildren(); ui.traceEmpty.hidden = false; ui.counter.textContent = "0 pasos";
  setResult("neutral", "Listo para simular", "Pulsa “Iniciar” para preparar el recorrido.");
  renderDiagram(); renderTable();
}

function renderTable() {
  const a = currentAutomaton();
  let head = `<thead><tr><th>Estado</th>${a.alphabet.map(s => `<th>${s}</th>`).join("")}${isNFA() ? "<th>ε</th>" : ""}</tr></thead>`;
  const rows = a.states.map(state => {
    const cells = a.alphabet.map(symbol => {
      const dest = a.transitions[state][symbol];
      return `<td>${formatDestination(dest)}</td>`;
    }).join("");
    const epsilon = isNFA() ? `<td>${formatDestination(a.transitions[state]["ε"] || [])}</td>` : "";
    return `<tr data-state="${state}"><td><span class="state-pill">${state}${state === a.initial ? " · inicial" : ""}${a.finals.includes(state) ? " · final" : ""}</span></td>${cells}${epsilon}</tr>`;
  }).join("");
  ui.table.innerHTML = `${head}<tbody>${rows}</tbody>`;
}
function formatDestination(dest) {
  if (Array.isArray(dest)) return dest.length ? dest.join(", ") : "∅";
  return dest || "∅";
}

/* Posiciones y aristas SVG definidas por ejemplo para mantener el dibujo legible. */
function diagramConfig() {
  if (mode === "afd") return {
    positions: { q0: [160, 140], q1: [450, 140] },
    edges: [
      { from: "q0", to: "q0", label: "0", path: "M 133 112 C 92 54, 228 54, 187 112", lx: 160, ly: 61, id: "q0|q0|0" },
      { from: "q0", to: "q1", label: "1", path: "M 191 140 C 250 105, 360 105, 419 140", lx: 305, ly: 108, id: "q0|q1|1" },
      { from: "q1", to: "q0", label: "0", path: "M 419 160 C 360 198, 250 198, 191 160", lx: 305, ly: 205, id: "q1|q0|0" },
      { from: "q1", to: "q1", label: "1", path: "M 423 112 C 382 54, 518 54, 477 112", lx: 450, ly: 61, id: "q1|q1|1" }
    ]
  };
  return {
    positions: { q0: [90, 140], qE: [245, 140], q1: [400, 140], q2: [545, 140] },
    edges: [
      { from: "q0", to: "q0", label: "0, 1", path: "M 63 112 C 22 54, 158 54, 117 112", lx: 90, ly: 61, id: "q0|q0|0" },
      { from: "q0", to: "qE", label: "ε", path: "M 121 140 L 214 140", lx: 168, ly: 128, id: "q0|qE|ε" },
      { from: "qE", to: "qE", label: "1", path: "M 218 112 C 177 54, 313 54, 272 112", lx: 245, ly: 61, id: "qE|qE|1" },
      { from: "qE", to: "q1", label: "0", path: "M 276 140 L 369 140", lx: 322, ly: 128, id: "qE|q1|0" },
      { from: "q1", to: "q2", label: "1", path: "M 431 140 L 514 140", lx: 472, ly: 128, id: "q1|q2|1" },
      { from: "q2", to: "q2", label: "0, 1", path: "M 518 112 C 477 54, 613 54, 572 112", lx: 545, ly: 61, id: "q2|q2|0" }
    ]
  };
}
function svgEl(name, attrs = {}, content = "") {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (content) el.textContent = content;
  return el;
}
function renderDiagram() {
  const a = currentAutomaton(), config = diagramConfig();
  ui.svg.replaceChildren();
  const defs = svgEl("defs");
  const marker = svgEl("marker", { id: "arrowhead", markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: "auto", markerUnits: "strokeWidth" });
  marker.appendChild(svgEl("path", { d: "M0,0 L0,6 L6,3 z", fill: "#aab6c9" }));
  defs.appendChild(marker);
  const activeMarker = svgEl("marker", { id: "arrowhead-active", markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: "auto", markerUnits: "strokeWidth" });
  activeMarker.appendChild(svgEl("path", { d: "M0,0 L0,6 L6,3 z", fill: "#4263eb" }));
  defs.appendChild(activeMarker); ui.svg.appendChild(defs);

  // Flecha de entrada al estado inicial.
  const [ix, iy] = config.positions[a.initial];
  ui.svg.appendChild(svgEl("path", { d: `M ${ix - 68} ${iy} L ${ix - 34} ${iy}`, class: "start-arrow", "marker-end": "url(#arrowhead)" }));
  ui.svg.appendChild(svgEl("text", { x: ix - 66, y: iy - 13, class: "start-label" }, "inicio"));

  config.edges.forEach(edge => {
    const active = activeEdge && (activeEdge === edge.id || (activeEdge.from === edge.from && activeEdge.to === edge.to && (edge.label.includes(activeEdge.symbol) || edge.label.includes("ε"))));
    ui.svg.appendChild(svgEl("path", { d: edge.path, class: `edge${active ? " active" : ""}`, "marker-end": active ? "url(#arrowhead-active)" : "url(#arrowhead)" }));
    ui.svg.appendChild(svgEl("text", { x: edge.lx, y: edge.ly, class: `edge-label${active ? " active" : ""}`, "text-anchor": "middle" }, edge.label));
  });

  a.states.forEach(state => {
    const [x, y] = config.positions[state];
    const active = activeStates.has(state);
    ui.svg.appendChild(svgEl("circle", { cx: x, cy: y, r: 29, class: `state-circle${active ? " active" : ""}` }));
    if (a.finals.includes(state)) ui.svg.appendChild(svgEl("circle", { cx: x, cy: y, r: 23, class: `state-circle final-ring${active ? " active" : ""}` }));
    ui.svg.appendChild(svgEl("text", { x, y, class: `state-label${active ? " active" : ""}` }, state));
    if (a.finals.includes(state)) ui.svg.appendChild(svgEl("text", { x, y: y + 44, class: "start-label", "text-anchor": "middle" }, "aceptación"));
  });
  // Estado activo se conserva entre pasos y se destaca también en la tabla.
  document.querySelectorAll("#transition-table tbody tr").forEach(row => row.classList.toggle("row-active", activeStates.has(row.dataset.state)));
}

/* AFD: una transición determinista por símbolo. */
function prepareDFA(input) {
  const a = automata.afd;
  let state = a.initial;
  const steps = [{ index: 0, symbol: "ε", before: "—", states: [state], description: `Estado inicial: ${state}. Aún no se ha consumido ningún símbolo.` }];
  for (let i = 0; i < input.length; i++) {
    const symbol = input[i], next = a.transitions[state][symbol];
    steps.push({ index: i + 1, symbol, before: state, states: [next], description: `δ(${state}, ${symbol}) = ${next}.`, transition: { from: state, to: next, symbol } });
    state = next;
  }
  return { steps, accepted: a.finals.includes(state), finalStates: [state], input, finished: false, cursor: 0 };
}

/* Cierre-ε: agrega recursivamente todos los estados alcanzables sin consumir entrada. */
function epsilonClosure(states, transitions) {
  const closure = new Set(states);
  const stack = [...states];
  while (stack.length) {
    const state = stack.pop();
    const destinations = transitions[state]?.["ε"] || [];
    for (const destination of destinations) {
      if (!closure.has(destination)) { closure.add(destination); stack.push(destination); }
    }
  }
  return [...closure].sort();
}
/* AFND: mantiene un conjunto de estados activos y aplica cierre-ε al inicio y tras cada símbolo. */
function prepareNFA(input) {
  const a = automata.afnd;
  let states = epsilonClosure([a.initial], a.transitions);
  const steps = [{ index: 0, symbol: "ε (inicio)", before: "—", states, description: `Cierre-ε inicial: {${states.join(", ")}}.` }];
  for (let i = 0; i < input.length; i++) {
    const symbol = input[i], beforeStates = states;
    const moved = new Set();
    beforeStates.forEach(state => (a.transitions[state][symbol] || []).forEach(destination => moved.add(destination)));
    states = epsilonClosure([...moved], a.transitions);
    steps.push({
      index: i + 1, symbol, before: `{${beforeStates.join(", ")}}`, states,
      description: `Con ${symbol}, se alcanzan {${[...moved].sort().join(", ") || "∅"}}; tras cierre-ε quedan {${states.join(", ") || "∅"}}.`,
      transition: { fromStates: beforeStates, toStates: states, symbol }
    });
  }
  return { steps, accepted: states.some(state => a.finals.includes(state)), finalStates: states, input, finished: false, cursor: 0 };
}

function startSimulation() {
  stopPlayback();
  const input = normalizeInput(ui.input.value);
  const invalid = [...input].find(symbol => !currentAutomaton().alphabet.includes(symbol));
  if (invalid !== undefined) {
    run = null; trace = []; activeStates = new Set(); activeEdge = null;
    ui.step.disabled = true; ui.play.disabled = true;
    ui.trace.replaceChildren(); ui.traceEmpty.hidden = false; ui.counter.textContent = "0 pasos";
    setResult("error", "Símbolo no válido", `El símbolo “${invalid}” no pertenece al alfabeto {0, 1}. Corrige la cadena e inténtalo de nuevo.`);
    renderDiagram(); renderTable(); return;
  }
  run = isNFA() ? prepareNFA(input) : prepareDFA(input);
  trace = [];
  ui.trace.replaceChildren(); ui.traceEmpty.hidden = true;
  ui.step.disabled = false; ui.play.disabled = false;
  activeStates = new Set(run.steps[0].states); activeEdge = null;
  setResult("neutral", "Simulación iniciada", input.length ? `Cadena: ${input}` : "Cadena vacía ε: no se consumen símbolos.");
  renderDiagram(); renderTable();
  appendTrace(run.steps[0], true);
  if (input.length === 0) finishSimulation();
}

function appendTrace(step, initial = false) {
  trace.push(step);
  const item = document.createElement("div"); item.className = "trace-item";
  const number = document.createElement("span"); number.className = "trace-number"; number.textContent = String(step.index);
  const body = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = initial ? (isNFA() ? "Cierre-ε inicial" : "Estado inicial") : `Símbolo procesado: ${step.symbol}`;
  const desc = document.createElement("p"); desc.textContent = step.description;
  body.append(title, desc);
  const token = document.createElement("span"); token.className = "trace-token"; token.textContent = isNFA() ? `{${step.states.join(", ") || "∅"}}` : step.states[0];
  item.append(number, body, token);
  ui.trace.appendChild(item);
  ui.counter.textContent = `${Math.max(0, trace.length - 1)} ${trace.length - 1 === 1 ? "paso" : "pasos"}`;
  item.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
}
function nextStep() {
  if (!run || run.finished) return;
  const nextIndex = run.cursor + 1;
  if (nextIndex >= run.steps.length) { finishSimulation(); return; }
  const step = run.steps[nextIndex];
  run.cursor = nextIndex;
  activeStates = new Set(step.states);
  activeEdge = step.transition || null;
  appendTrace(step);
  renderDiagram(); renderTable();
  if (nextIndex === run.steps.length - 1) finishSimulation();
  else setResult("neutral", `Paso ${nextIndex} de ${run.steps.length - 1}`, step.description);
}
function finishSimulation() {
  if (!run) return;
  run.finished = true;
  stopPlayback();
  ui.step.disabled = true; ui.play.disabled = true;
  const finals = currentAutomaton().finals;
  const finalActive = run.finalStates;
  const accepted = isNFA() ? finalActive.some(s => finals.includes(s)) : finals.includes(finalActive[0]);
  const statesText = isNFA() ? `{${finalActive.join(", ") || "∅"}}` : finalActive[0];
  if (accepted) setResult("success", "Cadena aceptada", `Al terminar, ${statesText} ${isNFA() ? "contiene un estado final" : "es un estado de aceptación"}. ${currentAutomaton().explanation}`);
  else setResult("failure", "Cadena rechazada", `Al terminar, ${statesText} ${isNFA() ? "no contiene ningún estado final" : "no es un estado de aceptación"}. ${currentAutomaton().explanation}`);
  if (trace.length) {
    const last = ui.trace.lastElementChild;
    if (last) {
      const status = document.createElement("span");
      status.className = `trace-status ${accepted ? "accept" : "reject"}`;
      status.textContent = accepted ? "ACEPTADA" : "RECHAZADA";
      last.appendChild(status);
    }
  }
  renderDiagram(); renderTable();
}
function togglePlayback() {
  if (!run) { startSimulation(); if (!run) return; }
  if (run.finished) return;
  if (playbackTimer !== null) { stopPlayback(); return; }
  ui.play.innerHTML = "<span>Ⅱ</span> Pausar";
  const tick = () => {
    if (!run || run.finished || playbackTimer === null) return;
    nextStep();
    if (run && !run.finished && playbackTimer !== null) playbackTimer = setTimeout(tick, Number(ui.speed.value));
    else playbackTimer = null;
  };
  playbackTimer = setTimeout(tick, Number(ui.speed.value));
}

ui.tabs.forEach(tab => tab.addEventListener("click", () => switchMode(tab.dataset.tab)));
ui.start.addEventListener("click", startSimulation);
ui.step.addEventListener("click", () => { if (!run) startSimulation(); else nextStep(); });
ui.play.addEventListener("click", togglePlayback);
ui.reset.addEventListener("click", resetSimulation);
ui.input.addEventListener("keydown", event => { if (event.key === "Enter") startSimulation(); });
ui.input.addEventListener("input", () => {
  const val = ui.input.value;
  const invalid = [...val].find(c => !currentAutomaton().alphabet.includes(c));
  ui.input.setCustomValidity(invalid ? `El símbolo "${invalid}" no pertenece al alfabeto {0, 1}.` : "");
});
ui.select.addEventListener("change", () => {
  const value = ui.select.value;
  const a = currentAutomaton();
  if (value === "custom") { ui.input.focus(); return; }
  ui.input.value = a.examples[value] ?? a.examples.example;
  resetSimulation();
});
ui.speed.addEventListener("input", () => {
  const value = Number(ui.speed.value);
  ui.speedLabel.textContent = value <= 500 ? "Rápida" : value <= 1000 ? "Normal" : "Lenta";
});
switchMode("afd");

// Pruebas de referencia disponibles desde la consola del navegador.
function verifyExamples() {
  const dfa = s => prepareDFA(s).accepted;
  const nfa = s => prepareNFA(s).accepted;
  const tests = [
    ["AFD acepta 1011", dfa("1011") === true],
    ["AFD rechaza 1010", dfa("1010") === false],
    ["AFD rechaza cadena vacía", dfa("") === false],
    ["AFND acepta 11010", nfa("11010") === true],
    ["AFND acepta 01", nfa("01") === true],
    ["AFND rechaza 1110", nfa("1110") === false],
    ["AFND rechaza cadena vacía", nfa("") === false]
  ];
  console.table(tests.map(([test, passed]) => ({ test, resultado: passed ? "OK" : "FALLO" })));
  return tests.every(([, passed]) => passed);
}
window.verifyExamples = verifyExamples;
