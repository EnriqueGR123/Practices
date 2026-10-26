
"use strict";

/*
 * SIMULADOR EDUCATIVO DE MÁQUINA DE TURING MULTICINTA
 * Expresión: (a + b)^2
 *
 * Los bits se almacenan en orden inverso: índice 0 = bit menos
 * significativo. La visualización muestra ese índice explícitamente.
 *
 * Cada llamada a step() ejecuta UNA transición de control:
 * lee símbolos, aplica una regla, escribe cuando corresponde,
 * mueve los cabezales y cambia el estado.
 *
 * El cálculo binario no utiliza Number, parseInt ni BigInt para
 * sumar o multiplicar los operandos. BigInt se usa exclusivamente
 * para presentar el equivalente decimal.
 */

const $ = (id) => document.getElementById(id);

const form = $("input-form");
const inputA = $("input-a");
const inputB = $("input-b");
const validation = $("validation");
const tapesView = $("tapes");
const stateView = $("current-state");
const stepView = $("step-count");
const phaseView = $("current-phase");
const statusView = $("machine-status");
const progressBar = $("progress-bar");
const progressText = $("progress-text");
const nextBtn = $("next-btn");
const autoBtn = $("auto-btn");
const resetBtn = $("reset-btn");
const startBtn = $("start-btn");
const speedInput = $("speed");
const speedValue = $("speed-value");
const transitionDetail = $("transition-detail");
const transitionRow = $("transition-row");
const transitionLog = $("transition-log");
const logCount = $("log-count");
const sumResult = $("sum-result");
const sumDecimal = $("sum-decimal");
const finalResult = $("final-result");
const finalDecimal = $("final-decimal");
const completionMessage = $("completion-message");

const MAX_STEPS = 100000;
const MAX_INPUT_BITS = 64;
const DISPLAY_RADIUS = 7;

/*
 * Tabla de verdad del sumador completo.
 * La clave es "bitA bitB acarreoEntrada".
 * El valor contiene [bitResultado, acarreoSalida].
 */
const FULL_ADDER = {
  "000": [0, 0],
  "001": [1, 0],
  "010": [1, 0],
  "011": [0, 1],
  "100": [1, 0],
  "101": [0, 1],
  "110": [0, 1],
  "111": [1, 1]
};

/* Puerta AND: producto de dos bits. */
const AND_GATE = {
  "00": 0,
  "01": 0,
  "10": 0,
  "11": 1
};

const TAPE_INFO = {
  A: { name: "Cinta A", description: "Primer operando" },
  B: { name: "Cinta B", description: "Segundo operando" },
  S: { name: "Cinta S", description: "Suma a + b" },
  P: { name: "Cinta P", description: "Producto acumulado" },
  W: { name: "Cinta W", description: "Producto parcial" }
};

let machine = null;
let autoTimer = null;
let autoRunning = false;
let lastLogItems = [];
let logCleared = false;

/* ---------------------------------------------------------
   UTILIDADES BINARIAS
--------------------------------------------------------- */

function normalizeBinary(text) {
  // Elimina ceros iniciales, manteniendo un cero si es el único bit.
  const normalized = text.replace(/^0+/, "");
  return normalized || "0";
}

function toBitsLSB(binary) {
  return normalizeBinary(binary)
    .split("")
    .reverse()
    .map((bit) => bit === "1" ? 1 : 0);
}

function bitsToBinary(bits) {
  let last = bits.length - 1;

  while (last > 0 && bits[last] === 0) {
    last--;
  }

  return bits.slice(0, last + 1)
    .reverse()
    .map(String)
    .join("");
}

function binaryToDecimal(binary) {
  // Conversión para presentación, no para efectuar las operaciones.
  return BigInt("0b" + binary).toString(10);
}

function readBit(tape, index) {
  // Las posiciones no escritas contienen el símbolo blanco.
  // En las cintas de trabajo, blanco se interpreta como bit 0
  // cuando participa en una operación aritmética.
  return tape[index] ?? 0;
}

function writeBit(tape, index, bit) {
  while (tape.length <= index) {
    tape.push(0);
  }

  tape[index] = bit;
}

function bitSymbol(bit) {
  return bit === null ? "□" : String(bit);
}

function fullAdder(a, b, carry) {
  const key = `${a}${b}${carry}`;
  const result = FULL_ADDER[key];

  if (!result) {
    throw new Error(`Regla de sumador inexistente: ${key}`);
  }

  return result;
}

/* ---------------------------------------------------------
   INICIALIZACIÓN
--------------------------------------------------------- */

function createMachine(binaryA, binaryB) {
  const bitsA = toBitsLSB(binaryA);
  const bitsB = toBitsLSB(binaryB);
  const n = Math.max(bitsA.length, bitsB.length);

  return {
    tapes: {
      A: bitsA.slice(),
      B: bitsB.slice(),
      S: [],
      P: Array(2 * n + 1).fill(0),
      W: Array(2 * n + 1).fill(0)
    },

    heads: { A: 0, B: 0, S: 0, P: 0, W: 0 },

    // Estados del programa de control.
    state: "SUM_READ",
    phase: "Suma binaria",
    steps: 0,
    maxSteps: MAX_STEPS,

    // Datos de control de la suma.
    sumIndex: 0,
    sumLength: n,
    sumCarry: 0,
    pendingSum: null,

    // Datos de control de la multiplicación.
    mulIndex: 0,
    partialIndex: 0,
    addIndex: 0,
    addCarry: 0,
    pendingAdd: null,

    // Seguimiento de escritura y transiciones.
    lastWrites: [],
    lastTransition: null,
    history: [],
    accepted: false,
    stopped: false,
    error: null
  };
}

/*
 * Una transición siempre produce un registro explícito:
 * estado previo, símbolos leídos, regla, escritura,
 * movimiento y estado siguiente.
 */
function recordTransition(m, details) {
  m.steps++;

  const entry = {
    number: m.steps,
    previous: details.previous,
    read: details.read ?? "—",
    rule: details.rule ?? "δ",
    write: details.write ?? "—",
    movement: details.movement ?? "S",
    next: m.state,
    explanation: details.explanation ?? ""
  };

  m.lastTransition = entry;
  m.history.push(entry);

  if (m.steps >= m.maxSteps && !m.accepted) {
    m.stopped = true;
    m.error = `Se alcanzó el límite de ${m.maxSteps} pasos.`;
  }

  return entry;
}

function setHeads(m, positions) {
  for (const [name, index] of Object.entries(positions)) {
    m.heads[name] = Math.max(0, index);
  }
}

/* ---------------------------------------------------------
   MOTOR DE TRANSICIONES
--------------------------------------------------------- */

function step() {
  if (!machine || machine.stopped || machine.accepted) return;

  const m = machine;
  const previous = m.state;

  m.lastWrites = [];

  try {
    switch (m.state) {

      /* FASE 1: SUMA BINARIA */

      case "SUM_READ": {
        m.phase = "Suma binaria";

        if (m.sumIndex >= m.sumLength) {
          if (m.sumCarry === 1) {
            m.state = "SUM_FINAL";
            setHeads(m, { S: m.sumIndex });
            recordTransition(m, {
              previous,
              read: `acarreo=${m.sumCarry}`,
              rule: "δ(SUM_READ, fin de operandos)",
              movement: "S",
              explanation: "Queda un acarreo que debe escribirse."
            });
          } else {
            m.state = "MUL_INIT";
            recordTransition(m, {
              previous,
              read: "fin de operandos",
              rule: "δ(SUM_READ, fin, acarreo=0)",
              movement: "S",
              explanation: "La suma termina sin acarreo pendiente."
            });
          }
          break;
        }

        const i = m.sumIndex;
        const a = readBit(m.tapes.A, i);
        const b = readBit(m.tapes.B, i);
        const carry = m.sumCarry;
        const [result, nextCarry] = fullAdder(a, b, carry);

        m.pendingSum = {
          index: i, a, b, carry, result, nextCarry
        };

        setHeads(m, { A: i, B: i, S: i });

        m.state = "SUM_WRITE";

        recordTransition(m, {
          previous,
          read: `A[${i}]=${a}, B[${i}]=${b}, C=${carry}`,
          rule: `FA(${a},${b},${carry}) → (${result},${nextCarry})`,
          movement: "S",
          explanation:
            `Sumador completo: bit de suma ${result}, nuevo acarreo ${nextCarry}.`
        });
        break;
      }

      case "SUM_WRITE": {
        const p = m.pendingSum;

        writeBit(m.tapes.S, p.index, p.result);
        m.lastWrites.push({ tape: "S", index: p.index });
        m.sumCarry = p.nextCarry;
        m.sumIndex++;

        setHeads(m, {
          A: m.sumIndex,
          B: m.sumIndex,
          S: m.sumIndex
        });

        m.state = "SUM_READ";

        recordTransition(m, {
          previous,
          read: `${p.a},${p.b},${p.carry}`,
          rule: `δ(SUM_WRITE, FA)`,
          write: `S[${p.index}] ← ${p.result}; C ← ${p.nextCarry}`,
          movement: "A+, B+, S+",
          explanation:
            "Se escribe el bit calculado y se actualiza el acarreo."
        });
        break;
      }

      case "SUM_FINAL": {
        const i = m.sumIndex;

        writeBit(m.tapes.S, i, 1);
        m.lastWrites.push({ tape: "S", index: i });

        m.sumIndex++;
        setHeads(m, { S: i });

        m.state = "MUL_INIT";

        recordTransition(m, {
          previous,
          read: `acarreo=${m.sumCarry}`,
          rule: "δ(SUM_FINAL, acarreo=1)",
          write: `S[${i}] ← 1`,
          movement: "S+",
          explanation: "Se escribe el acarreo final de la suma."
        });
        break;
      }

      /* FASE 2: PREPARACIÓN DE LA MULTIPLICACIÓN */

      case "MUL_INIT": {
        m.phase = "Multiplicación binaria";

        // Se normaliza la suma. Un resultado cero tiene un solo bit.
        const sum = bitsToBinary(m.tapes.S);
        m.tapes.S = toBitsLSB(sum);

        const n = m.tapes.S.length;
        m.tapes.P = Array(2 * n + 1).fill(0);
        m.tapes.W = Array(2 * n + 1).fill(0);

        m.mulIndex = 0;
        m.partialIndex = 0;
        m.addIndex = 0;
        m.addCarry = 0;

        setHeads(m, { S: 0, P: 0, W: 0 });

        m.state = "MUL_SELECT";

        recordTransition(m, {
          previous,
          read: `S=${sum}`,
          rule: "δ(MUL_INIT, preparación)",
          write: "P ← 0; W ← 0",
          movement: "S, P, W → 0",
          explanation:
            "Se inicializan el acumulador y el producto parcial."
        });
        break;
      }

      /* Seleccionar un bit del multiplicador. */

      case "MUL_SELECT": {
        const sumLength = m.tapes.S.length;

        if (m.mulIndex >= sumLength) {
          m.state = "HALT";
          m.accepted = true;
          m.stopped = true;

          recordTransition(m, {
            previous,
            read: "fin del multiplicador",
            rule: "δ(MUL_SELECT, fin)",
            movement: "S",
            explanation:
              "Todos los productos parciales fueron procesados."
          });
          break;
        }

        const multiplierBit = readBit(m.tapes.S, m.mulIndex);

        setHeads(m, {
          S: m.mulIndex,
          P: 0,
          W: m.mulIndex
        });

        if (multiplierBit === 0) {
          // El producto parcial de un bit 0 es cero.
          m.mulIndex++;
          m.state = "MUL_SELECT";

          recordTransition(m, {
            previous,
            read: `S[${m.mulIndex - 1}]=0`,
            rule: "AND(x,0)=0",
            write: "Producto parcial nulo",
            movement: "S+",
            explanation:
              "El bit del multiplicador es 0; se omite el producto parcial."
          });
        } else {
          m.tapes.W = Array(2 * sumLength + 1).fill(0);
          m.partialIndex = 0;
          m.state = "PARTIAL_WRITE";

          recordTransition(m, {
            previous,
            read: `S[${m.mulIndex}]=1`,
            rule: "AND(x,1)=x",
            write: "Preparar producto parcial",
            movement: "W → desplazamiento",
            explanation:
              "El bit es 1; se genera el multiplicando desplazado."
          });
        }
        break;
      }

      /* Producto parcial: AND bit a bit y desplazamiento. */

      case "PARTIAL_WRITE": {
        const n = m.tapes.S.length;

        if (m.partialIndex >= n) {
          m.addIndex = 0;
          m.addCarry = 0;
          m.state = "ADD_READ";

          recordTransition(m, {
            previous,
            read: "fin del multiplicando",
            rule: "δ(PARTIAL_WRITE, fin)",
            movement: "P,W → 0",
            explanation:
              "El producto parcial está completo; comienza su acumulación."
          });
          break;
        }

        const j = m.partialIndex;
        const multiplierIndex = m.mulIndex;
        const multiplicandBit = readBit(m.tapes.S, j);
        const multiplierBit = readBit(m.tapes.S, multiplierIndex);
        const productBit = AND_GATE[`${multiplicandBit}${multiplierBit}`];
        const target = j + multiplierIndex;

        writeBit(m.tapes.W, target, productBit);
        m.lastWrites.push({ tape: "W", index: target });

        setHeads(m, {
          S: j,
          W: target,
          P: target
        });

        m.partialIndex++;
        m.state = "PARTIAL_WRITE";

        recordTransition(m, {
          previous,
          read:
            `S[${j}]=${multiplicandBit}, S[${multiplierIndex}]=${multiplierBit}`,
          rule: `AND(${multiplicandBit},${multiplierBit})=${productBit}`,
          write: `W[${target}] ← ${productBit}`,
          movement: "S+, W+",
          explanation:
            `Bit ${j} del multiplicando, desplazado ${multiplierIndex} posiciones.`
        });
        break;
      }

      /* Acumular P + W mediante sumador completo. */

      case "ADD_READ": {
        const limit = m.tapes.P.length;

        if (m.addIndex >= limit) {
          m.mulIndex++;
          m.tapes.W = Array(limit).fill(0);
          m.state = "MUL_SELECT";

          recordTransition(m, {
            previous,
            read: "fin del acumulador",
            rule: "δ(ADD_READ, fin)",
            movement: "S+",
            explanation:
              "La suma del producto parcial terminó; sigue el siguiente bit."
          });
          break;
        }

        const i = m.addIndex;
        const p = readBit(m.tapes.P, i);
        const w = readBit(m.tapes.W, i);
        const carry = m.addCarry;
        const [result, nextCarry] = fullAdder(p, w, carry);

        m.pendingAdd = {
          index: i, p, w, carry, result, nextCarry
        };

        setHeads(m, { P: i, W: i });

        m.state = "ADD_WRITE";

        recordTransition(m, {
          previous,
          read: `P[${i}]=${p}, W[${i}]=${w}, C=${carry}`,
          rule: `FA(${p},${w},${carry}) → (${result},${nextCarry})`,
          movement: "S",
          explanation:
            `Sumador completo: resultado ${result}, acarreo ${nextCarry}.`
        });
        break;
      }

      case "ADD_WRITE": {
        const p = m.pendingAdd;
        writeBit(m.tapes.P, p.index, p.result);
        m.lastWrites.push({ tape: "P", index: p.index });

        m.addCarry = p.nextCarry;
        m.addIndex++;

        setHeads(m, {
          P: m.addIndex,
          W: m.addIndex
        });

        m.state = "ADD_READ";

        recordTransition(m, {
          previous,
          read: `${p.p},${p.w},${p.carry}`,
          rule: "δ(ADD_WRITE, FA)",
          write: `P[${p.index}] ← ${p.result}; C ← ${p.nextCarry}`,
          movement: "P+, W+",
          explanation:
            "Se escribe el bit de la suma parcial y se actualiza el acarreo."
        });
        break;
      }

      default: {
        throw new Error(`Estado desconocido: ${m.state}`);
      }
    }

    if (m.state === "HALT") {
      m.accepted = true;
      m.stopped = true;
    }

    render();
  } catch (error) {
    m.stopped = true;
    m.error = error.message;
    stopAuto();
    render();
  }
}

/* ---------------------------------------------------------
   VISUALIZACIÓN DE LAS CINTAS Y LOS CABEZALES
--------------------------------------------------------- */

function renderTape(name) {
  const m = machine;
  const tape = m.tapes[name];
  const head = m.heads[name] ?? 0;

  /*
   * Se muestran las celdas próximas al cabezal. La cinta subyacente
   * puede crecer; el desplazamiento visual no altera sus símbolos.
   */
  const start = Math.max(0, head - DISPLAY_RADIUS);
  const end = Math.max(head + DISPLAY_RADIUS, tape.length - 1);
  const cells = [];

  for (let i = start; i <= end; i++) {
    const isActive = i === head;
    const wasWritten = m.lastWrites.some(
      (item) => item.tape === name && item.index === i
    );

    const wrap = document.createElement("div");
    wrap.className = "tape-cell-wrap";
    if (isActive) wrap.classList.add("head-active");
    if (wasWritten) wrap.classList.add("recent-write");

    const pointer = document.createElement("div");
    pointer.className = "tape-head";
    pointer.textContent = "▼";

    const cell = document.createElement("div");
    cell.className = "tape-cell";
    cell.textContent = bitSymbol(tape[i] ?? null);
    cell.setAttribute("aria-label", `Cinta ${name}, posición ${i}`);

    const index = document.createElement("div");
    index.className = "tape-index";
    index.textContent = i;

    wrap.append(pointer, cell, index);
    cells.push(wrap);
  }

  const row = document.createElement("div");
  row.className = "tape-row";

  const top = document.createElement("div");
  top.className = "tape-top";

  const title = document.createElement("span");
  title.className = "tape-name";
  title.textContent = TAPE_INFO[name].name;

  const description = document.createElement("span");
  description.className = "tape-description";
  description.textContent = TAPE_INFO[name].description;

  top.append(title, description);

  const scroll = document.createElement("div");
  scroll.className = "tape-scroll";

  const cellStrip = document.createElement("div");
  cellStrip.className = "tape-cells";
  cellStrip.append(...cells);

  scroll.append(cellStrip);
  row.append(top, scroll);

  return row;
}

function renderTapes() {
  tapesView.replaceChildren();

  if (!machine) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Inicia una simulación para visualizar las cintas.";
    tapesView.append(empty);
    return;
  }

  for (const name of ["A", "B", "S", "P", "W"]) {
    tapesView.append(renderTape(name));
  }

  // Desplaza cada cinta para mantener visible el cabezal.
  tapesView.querySelectorAll(".tape-row").forEach((row) => {
    const active = row.querySelector(".head-active");
    if (active) {
      const scroll = row.querySelector(".tape-scroll");
      const center = active.offsetLeft + active.offsetWidth / 2;
      scroll.scrollLeft = Math.max(0, center - scroll.clientWidth / 2);
    }
  });
}

function formatTransition(entry) {
  transitionDetail.replaceChildren();

  const title = document.createElement("p");
  title.innerHTML = "<strong>Regla aplicada</strong>";

  const rule = document.createElement("p");
  rule.className = "rule";
  rule.textContent = entry.rule;

  const description = document.createElement("p");
  description.textContent = entry.explanation;

  const info = document.createElement("p");
  info.textContent =
    `Estado: ${entry.previous} → ${entry.next} | ` +
    `Lectura: ${entry.read} | Escritura: ${entry.write} | ` +
    `Movimiento: ${entry.movement}`;

  transitionDetail.append(title, rule, description, info);

  transitionRow.replaceChildren();

  const tr = document.createElement("tr");
  for (const value of [
    entry.previous, entry.read, entry.write,
    entry.movement, entry.next
  ]) {
    const td = document.createElement("td");
    td.textContent = value;
    tr.append(td);
  }

  transitionRow.append(tr);
}

function renderLog() {
  if (!machine) return;

  const history = machine.history;
  logCount.textContent = `${history.length} registros`;

  if (logCleared) return;

  transitionLog.replaceChildren();

  const recent = history.slice(-150).reverse();

  if (recent.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-state";
    li.textContent = "El registro está vacío.";
    transitionLog.append(li);
    return;
  }

  for (const entry of recent) {
    const li = document.createElement("li");

    const number = document.createElement("span");
    number.className = "log-number";
    number.textContent = `#${entry.number} `;

    const state = document.createElement("span");
    state.className = "log-state";
    state.textContent = `${entry.previous} → ${entry.next} `;

    const content = document.createElement("span");
    content.textContent =
      `| Lee: ${entry.read} | Regla: ${entry.rule} | ` +
      `Escribe: ${entry.write} | Mueve: ${entry.movement}`;

    li.append(number, state, content);
    transitionLog.append(li);
  }
}

function renderResults() {
  if (!machine) return;

  const s = bitsToBinary(machine.tapes.S);
  sumResult.textContent = s || "—";
  sumDecimal.textContent = s
    ? `Decimal: ${binaryToDecimal(s)}`
    : "Decimal: —";

  if (machine.accepted) {
    const result = bitsToBinary(machine.tapes.P);
    finalResult.textContent = result;
    finalDecimal.textContent = `Decimal: ${binaryToDecimal(result)}`;

    completionMessage.className = "completion-message success";
    completionMessage.textContent =
      `Aceptación HALT: ${result}₂ = ` +
      `${binaryToDecimal(result)}₁₀.`;
  } else {
    finalResult.textContent = "—";
    finalDecimal.textContent = "Decimal: —";

    if (machine.error) {
      completionMessage.className = "completion-message error";
      completionMessage.textContent = machine.error;
    } else {
      completionMessage.className = "completion-message";
      completionMessage.textContent =
        "El resultado final estará disponible al alcanzar HALT.";
    }
  }
}

function render() {
  if (!machine) return;

  stateView.textContent = machine.state;
  stepView.textContent = machine.steps;
  phaseView.textContent = machine.phase;

  const finished = machine.accepted;
  const stopped = machine.stopped;

  statusView.className = "tag";
  if (finished) {
    statusView.classList.add("tag-done");
    statusView.textContent = "Aceptada";
  } else if (machine.error) {
    statusView.classList.add("tag-error");
    statusView.textContent = "Detenida";
  } else if (stopped) {
    statusView.classList.add("tag-idle");
    statusView.textContent = "Pausada";
  } else {
    statusView.classList.add("tag-running");
    statusView.textContent = "En ejecución";
  }

  const progress = Math.min(
    100, (machine.steps / machine.maxSteps) * 100
  );
  progressBar.style.width = `${progress}%`;
  progressText.textContent =
    `${machine.steps.toLocaleString("es-MX")} / ` +
    `${machine.maxSteps.toLocaleString("es-MX")} pasos máximos`;

  nextBtn.disabled = finished || stopped;
  autoBtn.disabled = finished || Boolean(machine.error);

  if (finished) {
    autoBtn.textContent = "✓ Finalizada";
  } else if (autoRunning) {
    autoBtn.textContent = "Ⅱ Pausar";
  } else {
    autoBtn.textContent = "▶ Automático";
  }

  renderTapes();

  if (machine.lastTransition) {
    formatTransition(machine.lastTransition);
  }

  renderLog();
  renderResults();
}

/* ---------------------------------------------------------
   CONTROLES DE LA INTERFAZ
--------------------------------------------------------- */

function stopAuto() {
  autoRunning = false;

  if (autoTimer !== null) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }

  if (machine && !machine.accepted && !machine.error) {
    autoBtn.textContent = "▶ Automático";
  }
}

function scheduleAutoStep() {
  if (!autoRunning || !machine ||
      machine.stopped || machine.accepted) {
    stopAuto();
    render();
    return;
  }

  autoTimer = setTimeout(() => {
    autoTimer = null;
    if (!autoRunning) return;

    step();

    if (autoRunning && machine &&
        !machine.stopped && !machine.accepted) {
      scheduleAutoStep();
    } else {
      stopAuto();
      render();
    }
  }, Number(speedInput.value));
}

function toggleAuto() {
  if (!machine || machine.accepted || machine.error) return;

  if (autoRunning) {
    stopAuto();
    render();
    return;
  }

  autoRunning = true;
  render();
  scheduleAutoStep();
}

function validateInput(a, b) {
  const errors = [];

  for (const [name, value] of [["a", a], ["b", b]]) {
    if (value.trim() === "") {
      errors.push(`El operando ${name} no puede estar vacío.`);
    } else if (!/^[01]+$/.test(value.trim())) {
      errors.push(`El operando ${name} solo puede contener 0 y 1.`);
    } else if (value.trim().length > MAX_INPUT_BITS) {
      errors.push(
        `El operando ${name} supera el máximo de ${MAX_INPUT_BITS} bits.`
      );
    }
  }

  return errors;
}

function startSimulation(event) {
  if (event) event.preventDefault();

  stopAuto();

  const a = inputA.value.trim();
  const b = inputB.value.trim();
  const errors = validateInput(a, b);

  if (errors.length) {
    validation.textContent = errors.join(" ");
    return;
  }

  validation.textContent = "";
  logCleared = false;

  machine = createMachine(
    normalizeBinary(a),
    normalizeBinary(b)
  );

  /*
   * El primer render muestra la configuración inicial.
   * Las transiciones posteriores solo ocurren al avanzar.
   */
  render();
}

function resetSimulation() {
  stopAuto();
  machine = null;
  logCleared = false;

  tapesView.replaceChildren();
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = "Inicia una simulación para visualizar las cintas.";
  tapesView.append(empty);

  stateView.textContent = "q₀";
  stepView.textContent = "0";
  phaseView.textContent = "Preparación";
  statusView.className = "tag tag-idle";
  statusView.textContent = "Sin iniciar";

  progressBar.style.width = "0%";
  progressText.textContent = "0 pasos";

  nextBtn.disabled = true;
  autoBtn.disabled = true;
  autoBtn.textContent = "▶ Automático";

  transitionDetail.replaceChildren();
  const waiting = document.createElement("p");
  waiting.textContent = "Esperando el inicio de la máquina.";
  transitionDetail.append(waiting);

  transitionRow.replaceChildren();
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 5;
  td.className = "muted";
  td.textContent = "Sin transiciones registradas.";
  tr.append(td);
  transitionRow.append(tr);

  transitionLog.replaceChildren();
  const logEmpty = document.createElement("li");
  logEmpty.className = "empty-state";
  logEmpty.textContent = "El registro está vacío.";
  transitionLog.append(logEmpty);
  logCount.textContent = "0 registros";

  sumResult.textContent = "—";
  sumDecimal.textContent = "Decimal: —";
  finalResult.textContent = "—";
  finalDecimal.textContent = "Decimal: —";

  completionMessage.className = "completion-message";
  completionMessage.textContent =
    "El resultado aparecerá cuando la máquina alcance el estado HALT.";

  validation.textContent = "";
}

function loadExample() {
  inputA.value = "10";
  inputB.value = "11";
  startSimulation();
}

/* ---------------------------------------------------------
   EVENTOS
--------------------------------------------------------- */

form.addEventListener("submit", startSimulation);

nextBtn.addEventListener("click", () => {
  stopAuto();
  step();
});

autoBtn.addEventListener("click", toggleAuto);

resetBtn.addEventListener("click", resetSimulation);

$("example-btn").addEventListener("click", loadExample);
$("load-example-bottom").addEventListener("click", loadExample);

speedInput.addEventListener("input", () => {
  speedValue.textContent = `${speedInput.value} ms`;

  if (autoRunning) {
    stopAuto();
    autoRunning = true;
    scheduleAutoStep();
    render();
  }
});

$("clear-log-btn").addEventListener("click", () => {
  if (!machine) return;

  /*
   * Limpia únicamente la vista del registro.
   * No elimina la historia interna ni altera la máquina.
   */
  logCleared = true;
  transitionLog.replaceChildren();

  const li = document.createElement("li");
  li.className = "empty-state";
  li.textContent =
    "Vista del registro limpia. La ejecución continúa sin cambios.";
  transitionLog.append(li);
});

/* Inicialización de la interfaz. */
speedValue.textContent = `${speedInput.value} ms`;
resetSimulation();
