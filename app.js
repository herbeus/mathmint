/* ============================================================
   MathMint — worksheet generator
   Pure client-side. No build, no deps. Boring tech, ships today.
   ============================================================ */
(function () {
  "use strict";

  const LEVELS = {
    1: { min: 0, max: 10,   label: "Starter" },
    2: { min: 0, max: 20,   label: "Easy" },
    3: { min: 0, max: 100,  label: "Medium" },
    4: { min: 0, max: 1000, label: "Hard" },
  };
  const OP_LABEL = { add: "Addition", sub: "Subtraction", mul: "Multiply", div: "Divide", mix: "Mixed", times: "Times tables", skip: "Skip counting", bonds: "Number bonds", fact: "Fact families", time: "Telling time", money: "Counting money" };
  const OP_SIGN  = { add: "+", sub: "−", mul: "×", div: "÷", times: "×" };

  // Skip counting: full-width sequence rows the kid fills in (count by 2s/5s/10s).
  const SKIP_ROWS = 10;   // sequences per sheet
  const SKIP_TERMS = 10;  // numbers in each sequence

  // Number bonds: part-part-whole diagrams (Singapore math). One value is left
  // blank — sometimes a part, sometimes the whole — so kids drill both directions.
  const BOND_COUNT = 12;  // bonds per sheet (3 cols × 4 rows)

  // Fact families: a triangle of three related numbers + the four facts that
  // connect them. Add/sub families (whole + two parts) or mult/div families
  // (product + two factors). The triangle is given; kids complete the 4 facts.
  const FACT_COUNT = 6;   // families per sheet (2 cols × 3 rows)

  // Telling time: analog clock faces; the kid writes the digital time below each.
  // Precision (o'clock / half / quarter / 5-minute) sets which minute values appear.
  const TIME_COUNT = 9;   // clocks per sheet (3 cols × 3 rows — large enough to read)
  const TIME_MINUTES = {
    hour:    [0],
    half:    [0, 30],
    quarter: [0, 15, 30, 45],
    five:    [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
  };

  // Counting money: a cluster of coin/bill tokens the kid totals up. The "set"
  // picks which denominations appear (pennies & nickels → bills & coins) and the
  // answer format — cents (¢) for coin-only sets, dollars ($X.XX) once bills join.
  const MONEY_COUNT = 8;   // money clusters per sheet (2 cols × 4 rows)
  const COIN_DEF = {
    penny:   { v: 1,  name: "PENNY",   size: "penny",   metal: "copper" },
    nickel:  { v: 5,  name: "NICKEL",  size: "nickel",  metal: "silver" },
    dime:    { v: 10, name: "DIME",    size: "dime",    metal: "silver" },
    quarter: { v: 25, name: "QUARTER", size: "quarter", metal: "silver" },
  };
  const BILL_DEF = {
    one:  { v: 100, label: "$1", corner: "1" },
    five: { v: 500, label: "$5", corner: "5" },
  };
  const MONEY_SETS = {
    pennies: { coins: ["penny", "nickel"],                   bills: [],             cap: 99,   fmt: "cents",   min: 3, max: 6 },
    dimes:   { coins: ["penny", "nickel", "dime"],           bills: [],             cap: 99,   fmt: "cents",   min: 3, max: 6 },
    coins:   { coins: ["penny", "nickel", "dime", "quarter"],bills: [],             cap: 99,   fmt: "cents",   min: 3, max: 6 },
    bills:   { coins: ["nickel", "dime", "quarter"],         bills: ["one", "five"],cap: 1500, fmt: "dollars", min: 3, max: 6 },
  };

  const state = {
    op: "add",
    level: 1,
    table: 2,      // which times table (2–12), used only when op === "times"
    interval: 5,   // count-by step (2/5/10), used only when op === "skip"
    total: 10,     // number-bond whole (5/10/20), used only when op === "bonds"
    fam: "as",     // fact-family type: "as" add/sub, "md" mult/div (op === "fact")
    prec: "hour",  // telling-time precision: hour/half/quarter/five (op === "time")
    coinset: "coins", // money set: pennies/dimes/coins/bills (op === "money")
    count: 20,
    cols: 2,
    title: "Math Practice",
    answerKey: false,
    problems: [],
  };

  const $ = (sel) => document.querySelector(sel);
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  /* ---- problem generation ---- */
  function makeProblem(op, level) {
    const L = LEVELS[level];
    let a, b, sign, answer;
    const realOp = op === "mix" ? ["add", "sub", "mul", "div"][rnd(0, 3)] : op;

    switch (realOp) {
      case "add":
        a = rnd(L.min, L.max); b = rnd(L.min, L.max);
        answer = a + b; sign = "+";
        break;
      case "sub":
        a = rnd(L.min, L.max); b = rnd(L.min, a); // keep non-negative
        answer = a - b; sign = "−";
        break;
      case "mul": {
        // scale factors down so products stay sane per level
        const cap = level <= 1 ? 5 : level === 2 ? 10 : level === 3 ? 12 : 20;
        a = rnd(1, cap); b = rnd(1, cap);
        answer = a * b; sign = "×";
        break;
      }
      case "div": {
        // build from a clean product so it divides evenly
        const cap = level <= 1 ? 5 : level === 2 ? 10 : level === 3 ? 12 : 20;
        b = rnd(1, cap);
        answer = rnd(1, cap);
        a = b * answer; sign = "÷";
        break;
      }
    }
    return { a, b, sign, answer };
  }

  function generate() {
    // Times tables: ordered facts N×1 … N×12 (the way kids actually drill a table)
    if (state.op === "times") {
      const t = state.table || 2;
      const facts = [];
      for (let k = 1; k <= 12; k++) {
        facts.push({ a: t, b: k, sign: "×", answer: t * k });
      }
      state.problems = facts;
      bumpCounter();
      return;
    }

    // Skip counting: rows of "count by N" sequences. The first term is always
    // given as an anchor; the rest are a mix of given numbers and blanks the
    // kid fills in — the way real classroom "missing numbers" sheets look.
    if (state.op === "skip") {
      const iv = state.interval || 5;
      const rows = [];
      for (let r = 0; r < SKIP_ROWS; r++) {
        const startStep = rnd(1, 5); // vary where each sequence begins
        const cells = [];
        for (let k = 0; k < SKIP_TERMS; k++) {
          const v = iv * (startStep + k);
          const given = k === 0 ? true : Math.random() < 0.34;
          cells.push({ v, given });
        }
        rows.push({ interval: iv, cells });
      }
      state.problems = rows;
      bumpCounter();
      return;
    }

    // Number bonds: part-part-whole. whole = total; parts add up to it; exactly
    // one of {whole, part1, part2} is blank. ~40% ask for the whole (parts shown,
    // child adds), ~60% ask for a missing part (whole + one part shown).
    if (state.op === "bonds") {
      const total = state.total || 10;
      const bonds = [];
      const seen = new Set();
      let guard = 0;
      while (bonds.length < BOND_COUNT && guard < BOND_COUNT * 60) {
        guard++;
        const part1 = rnd(1, total - 1);
        const part2 = total - part1;
        // blank: 2 = whole, 1 = part1, 0 = part2
        const blank = Math.random() < 0.4 ? 2 : (Math.random() < 0.5 ? 1 : 0);
        const key = `${part1}-${blank}`;
        if (seen.has(key)) continue; // avoid identical bonds on one sheet
        seen.add(key);
        bonds.push({ whole: total, part1, part2, blank });
      }
      state.problems = bonds;
      bumpCounter();
      return;
    }

    // Fact families: a "triangle" of three related numbers and the four facts
    // that bind them. Add/sub: whole + two parts (parts add to the whole).
    // Mult/div: product + two factors. We skip families where the two parts
    // are equal (those collapse to just two distinct facts, not four).
    if (state.op === "fact") {
      const md = state.fam === "md";
      const cards = [];
      const seen = new Set();
      let guard = 0;
      while (cards.length < FACT_COUNT && guard < FACT_COUNT * 80) {
        guard++;
        let p1, p2, whole;
        if (md) {
          p1 = rnd(2, 9); p2 = rnd(2, 9);
          if (p1 === p2) continue;
          whole = p1 * p2;
        } else {
          p1 = rnd(1, 9); p2 = rnd(1, 9);
          if (p1 === p2) continue;
          whole = p1 + p2;
        }
        const lo = Math.min(p1, p2), hi = Math.max(p1, p2);
        const key = `${lo}-${hi}`;
        if (seen.has(key)) continue; // no duplicate family on one sheet
        seen.add(key);
        cards.push({ type: state.fam, p1, p2, whole });
      }
      state.problems = cards;
      bumpCounter();
      return;
    }

    // Telling time: each problem is a clock showing hour:minute. The minute set
    // is driven by the precision (o'clock only / half / quarter / 5-minute). The
    // kid reads the analog clock and writes the digital time on the line below.
    if (state.op === "time") {
      const mins = TIME_MINUTES[state.prec] || TIME_MINUTES.hour;
      const clocks = [];
      const seen = new Set();
      let guard = 0;
      while (clocks.length < TIME_COUNT && guard < TIME_COUNT * 120) {
        guard++;
        const hour = rnd(1, 12);
        const minute = mins[rnd(0, mins.length - 1)];
        const key = `${hour}:${minute}`;
        if (seen.has(key)) continue; // no duplicate time on one sheet
        seen.add(key);
        clocks.push({ hour, minute });
      }
      state.problems = clocks;
      bumpCounter();
      return;
    }

    // Counting money: each problem is a handful of coins (and sometimes bills)
    // the kid totals up. The set picks which denominations are in play and the
    // answer format. Coin-only sets stay under a dollar so the total reads in ¢;
    // once bills join, totals run higher and the answer is dollars-and-cents.
    if (state.op === "money") {
      const cfg = MONEY_SETS[state.coinset] || MONEY_SETS.coins;
      const pool = cfg.coins
        .map((k) => ({ kind: "coin", key: k, v: COIN_DEF[k].v }))
        .concat(cfg.bills.map((k) => ({ kind: "bill", key: k, v: BILL_DEF[k].v })));
      const out = [];
      const seen = new Set();
      let guard = 0;
      while (out.length < MONEY_COUNT && guard < MONEY_COUNT * 160) {
        guard++;
        const n = rnd(cfg.min, cfg.max);
        const items = [];
        let cents = 0;
        for (let k = 0; k < n; k++) {
          const pick = pool[rnd(0, pool.length - 1)];
          items.push(pick);
          cents += pick.v;
        }
        if (cents === 0) continue;
        if (cfg.fmt === "cents" && cents > cfg.cap) continue; // keep coin totals under $1
        items.sort((a, b) => b.v - a.v); // bills + big coins lead, like a real handful
        const sig = items.map((it) => it.key).join("-");
        if (seen.has(sig)) continue;     // no identical cluster twice on a sheet
        seen.add(sig);
        out.push({ items, cents, fmt: cfg.fmt });
      }
      state.problems = out;
      bumpCounter();
      return;
    }

    const seen = new Set();
    const out = [];
    let guard = 0;
    while (out.length < state.count && guard < state.count * 40) {
      guard++;
      const p = makeProblem(state.op, state.level);
      const key = `${p.a}${p.sign}${p.b}`;
      if (seen.has(key)) continue;       // avoid dup problems on one sheet
      seen.add(key);
      out.push(p);
    }
    state.problems = out;
    bumpCounter();
  }

  /* ---- rendering ---- */
  // One number-bond diagram as inline SVG: whole on top, two parts below,
  // joined by two links. A blank node is dashed; on the answer key it fills coral.
  function bondMarkup(p, showAnswers) {
    const node = (cx, cy, r, val, isBlank) => {
      const cls = isBlank ? "bond-node bond-node--blank" : "bond-node";
      let label = "";
      if (!isBlank) {
        label = `<text class="bond-val" x="${cx}" y="${cy}">${val}</text>`;
      } else if (showAnswers) {
        label = `<text class="bond-val bond-val--key" x="${cx}" y="${cy}">${val}</text>`;
      }
      return `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}"/>${label}`;
    };
    const wBlank = p.blank === 2, p1Blank = p.blank === 1, p2Blank = p.blank === 0;
    return (
      `<svg class="bond-svg" viewBox="0 0 200 168" role="img" aria-label="number bond">` +
      `<line class="bond-link" x1="100" y1="42" x2="50" y2="124"/>` +
      `<line class="bond-link" x1="100" y1="42" x2="150" y2="124"/>` +
      node(100, 40, 31, p.whole, wBlank) +
      node(48, 126, 28, p.part1, p1Blank) +
      node(152, 126, 28, p.part2, p2Blank) +
      `</svg>`
    );
  }

  // The four facts that make up a family, in teaching order
  // (two commutative + two inverse facts).
  function factEqs(c) {
    if (c.type === "md") {
      return [
        { a: c.p1, sign: "×", b: c.p2, answer: c.whole },
        { a: c.p2, sign: "×", b: c.p1, answer: c.whole },
        { a: c.whole, sign: "÷", b: c.p1, answer: c.p2 },
        { a: c.whole, sign: "÷", b: c.p2, answer: c.p1 },
      ];
    }
    return [
      { a: c.p1, sign: "+", b: c.p2, answer: c.whole },
      { a: c.p2, sign: "+", b: c.p1, answer: c.whole },
      { a: c.whole, sign: "−", b: c.p1, answer: c.p2 },
      { a: c.whole, sign: "−", b: c.p2, answer: c.p1 },
    ];
  }

  // One fact-family triangle as inline SVG: the whole (sum/product) at the apex,
  // the two parts at the base corners, the family's operations in the center.
  function factTriangleMarkup(c) {
    const opSym = c.type === "md" ? "× ÷" : "+ −";
    return (
      `<svg class="fact-svg" viewBox="0 0 200 150" role="img" aria-label="fact family triangle">` +
      `<polygon class="fact-tri" points="100,32 38,128 162,128"/>` +
      `<text class="fact-op" x="100" y="98">${opSym}</text>` +
      `<circle class="fact-node fact-node--whole" cx="100" cy="34" r="26"/>` +
      `<text class="fact-val" x="100" y="34">${c.whole}</text>` +
      `<circle class="fact-node" cx="40" cy="126" r="24"/>` +
      `<text class="fact-val" x="40" y="126">${c.p1}</text>` +
      `<circle class="fact-node" cx="160" cy="126" r="24"/>` +
      `<text class="fact-val" x="160" y="126">${c.p2}</text>` +
      `</svg>`
    );
  }

  // One analog clock face as inline SVG: hour numbers 1–12, minute + hour ticks,
  // and two hands set to hour:minute. The hour hand creeps forward with the
  // minutes (3:30 sits halfway to 4) so the clocks read like a real one.
  function clockFaceSvg(hour, minute, aria) {
    const cx = 100, cy = 100, P = Math.PI / 180;
    let ticks = "";
    for (let k = 0; k < 60; k++) {
      const a = k * 6 * P, isHr = k % 5 === 0, r1 = isHr ? 77 : 83;
      const x1 = (cx + r1 * Math.sin(a)).toFixed(1), y1 = (cy - r1 * Math.cos(a)).toFixed(1);
      const x2 = (cx + 88 * Math.sin(a)).toFixed(1), y2 = (cy - 88 * Math.cos(a)).toFixed(1);
      ticks += `<line class="clock-tick ${isHr ? "clock-tick--hr" : "clock-tick--min"}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
    let nums = "";
    for (let k = 1; k <= 12; k++) {
      const a = k * 30 * P;
      const x = (cx + 67 * Math.sin(a)).toFixed(1), y = (cy - 67 * Math.cos(a)).toFixed(1);
      nums += `<text class="clock-num" x="${x}" y="${y}">${k}</text>`;
    }
    const minA = minute * 6 * P;
    const hrA = ((hour % 12) * 30 + minute * 0.5) * P;
    const mx = (cx + 64 * Math.sin(minA)).toFixed(1), my = (cy - 64 * Math.cos(minA)).toFixed(1);
    const hx = (cx + 43 * Math.sin(hrA)).toFixed(1), hy = (cy - 43 * Math.cos(hrA)).toFixed(1);
    const label = aria || `clock showing ${hour}:${String(minute).padStart(2, "0")}`;
    return (
      `<svg class="clock-svg" viewBox="0 0 200 200" role="img" aria-label="${label}">` +
      `<circle class="clock-face" cx="${cx}" cy="${cy}" r="90"/>` +
      ticks + nums +
      `<line class="clock-hand clock-hand--hr" x1="${cx}" y1="${cy}" x2="${hx}" y2="${hy}"/>` +
      `<line class="clock-hand clock-hand--min" x1="${cx}" y1="${cy}" x2="${mx}" y2="${my}"/>` +
      `<circle class="clock-center" cx="${cx}" cy="${cy}" r="4.5"/>` +
      `</svg>`
    );
  }

  // One coin token as inline SVG: a two-ring disc, sized and coloured by
  // denomination (copper penny, silver nickel/dime/quarter), labelled with the
  // coin's name. Print-friendly and recognisable in black & white.
  function coinSvg(key) {
    const c = COIN_DEF[key];
    return (
      `<svg class="coin coin--${c.size} coin--${c.metal}" viewBox="0 0 60 60" role="img" aria-label="${c.name.toLowerCase()}">` +
      `<circle class="coin-disc" cx="30" cy="30" r="28"/>` +
      `<circle class="coin-ring" cx="30" cy="30" r="23"/>` +
      `<text class="coin-name" x="30" y="31">${c.name}</text>` +
      `</svg>`
    );
  }

  // One bill as inline SVG: a green note with an inset border, a seal, the
  // amount in the middle and the denomination in two corners.
  function billSvg(key) {
    const b = BILL_DEF[key];
    return (
      `<svg class="bill bill--${key}" viewBox="0 0 104 54" role="img" aria-label="${b.label} bill">` +
      `<rect class="bill-note" x="2" y="2" width="100" height="50" rx="6"/>` +
      `<rect class="bill-inner" x="8" y="8" width="88" height="38" rx="4"/>` +
      `<circle class="bill-seal" cx="26" cy="27" r="9"/>` +
      `<text class="bill-amt" x="58" y="28">${b.label}</text>` +
      `<text class="bill-corner" x="13" y="16">${b.corner}</text>` +
      `<text class="bill-corner" x="91" y="46">${b.corner}</text>` +
      `</svg>`
    );
  }

  function moneyCluster(items) {
    return items.map((it) => (it.kind === "bill" ? billSvg(it.key) : coinSvg(it.key))).join("");
  }

  // The "Total" line below a money cluster. Coin-only sets answer in cents (52¢);
  // sets with bills answer in dollars-and-cents ($6.35). The key fills it coral.
  function moneyAnswer(p, showAnswers) {
    const shown = showAnswers ? " shown" : "";
    if (p.fmt === "dollars") {
      const val = showAnswers ? (p.cents / 100).toFixed(2) : "";
      return `<span class="money-lab">Total</span><span class="money-unit">$</span><span class="money-blank${shown}">${val}</span>`;
    }
    const val = showAnswers ? String(p.cents) : "";
    return `<span class="money-lab">Total</span><span class="money-blank${shown}">${val}</span><span class="money-unit">¢</span>`;
  }

  function sheetEl({ showAnswers, isKey }) {
    const sheet = document.createElement("div");
    sheet.className = "sheet";

    const head = document.createElement("div");
    head.className = "sheet-head";
    head.innerHTML =
      `<h2 class="sheet-title">${escapeHtml(state.title || "Math Practice")}</h2>` +
      `<span class="sheet-brand">MATHMINT.PAGES.DEV</span>`;
    sheet.appendChild(head);

    if (isKey) {
      const tag = document.createElement("div");
      tag.className = "answerkey-label";
      tag.textContent = "ANSWER KEY";
      sheet.appendChild(tag);
    } else {
      const meta = document.createElement("div");
      meta.className = "sheet-meta";
      meta.innerHTML =
        `<span>Name: <span class="ln"></span></span>` +
        `<span>Date: <span class="ln sm"></span></span>` +
        `<span>Score: <span class="ln sm"></span></span>`;
      sheet.appendChild(meta);
    }

    const isSkip = state.op === "skip";
    const isBonds = state.op === "bonds";
    const isFact = state.op === "fact";
    const isTime = state.op === "time";
    const isMoney = state.op === "money";
    const grid = document.createElement("div");
    grid.className = isSkip
      ? "problems problems--seq"
      : isBonds
      ? "problems problems--bonds"
      : isFact
      ? "problems problems--fact"
      : isTime
      ? "problems problems--time"
      : isMoney
      ? "problems problems--money"
      : "problems";
    // Skip-counting rows are full-width sequences; number bonds are a fixed 3-up
    // diagram grid; fact families a fixed 2-up triangle grid; telling time a
    // fixed 3-up clock grid; everything else honors the column choice.
    grid.style.gridTemplateColumns = isSkip
      ? "1fr"
      : isBonds
      ? "repeat(3, 1fr)"
      : isFact
      ? "repeat(2, 1fr)"
      : isTime
      ? "repeat(3, 1fr)"
      : isMoney
      ? "repeat(2, 1fr)"
      : `repeat(${state.cols}, 1fr)`;
    grid.dataset.cols = isSkip ? 1 : isBonds ? 3 : isFact ? 2 : isTime ? 3 : isMoney ? 2 : state.cols; // lets CSS scale type/gaps so equations never fragment in narrow columns
    state.problems.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "problem";
      if (isMoney) {
        row.classList.add("money-cell");
        row.innerHTML =
          `<span class="p-num">${i + 1}.</span>` +
          `<div class="coins">${moneyCluster(p.items)}</div>` +
          `<div class="money-ans">${moneyAnswer(p, showAnswers)}</div>`;
      } else if (isTime) {
        row.classList.add("time-cell");
        const mm = String(p.minute).padStart(2, "0");
        const ans = showAnswers
          ? `<span class="clock-blank shown">${p.hour}</span><span class="clock-colon">:</span><span class="clock-blank shown">${mm}</span>`
          : `<span class="clock-blank"></span><span class="clock-colon">:</span><span class="clock-blank"></span>`;
        row.innerHTML =
          `<span class="p-num">${i + 1}.</span>` +
          clockFaceSvg(p.hour, p.minute) +
          `<div class="clock-ans">${ans}</div>`;
      } else if (isFact) {
        row.classList.add("fact-cell");
        const eqsHtml = factEqs(p)
          .map((e) => {
            const ans = showAnswers
              ? `<span class="p-ans shown">${e.answer}</span>`
              : `<span class="p-ans"></span>`;
            return `<div class="fact-eq"><span class="p-eq">${e.a} ${e.sign} ${e.b} =</span>${ans}</div>`;
          })
          .join("");
        row.innerHTML =
          `<span class="p-num">${i + 1}.</span>` +
          factTriangleMarkup(p) +
          `<div class="fact-eqs">${eqsHtml}</div>`;
      } else if (isBonds) {
        row.classList.add("bond-cell");
        row.innerHTML =
          `<span class="p-num">${i + 1}.</span>` +
          bondMarkup(p, showAnswers);
      } else if (isSkip) {
        row.classList.add("seq-row");
        const cellsHtml = p.cells
          .map((c) => {
            if (c.given) return `<span class="seq-cell given">${c.v}</span>`;
            return showAnswers
              ? `<span class="seq-cell shown">${c.v}</span>`
              : `<span class="seq-cell blank"></span>`;
          })
          .join("");
        row.innerHTML =
          `<span class="p-num">${i + 1}.</span>` +
          `<span class="seq-step">+${p.interval}</span>` +
          `<div class="seq">${cellsHtml}</div>`;
      } else {
        const ansHtml = showAnswers
          ? `<span class="p-ans shown">${p.answer}</span>`
          : `<span class="p-ans"></span>`;
        row.innerHTML =
          `<span class="p-num">${i + 1}.</span>` +
          `<span class="p-eq">${p.a} ${p.sign} ${p.b} =</span>` +
          ansHtml;
      }
      grid.appendChild(row);
    });
    sheet.appendChild(grid);

    const foot = document.createElement("div");
    foot.className = "sheet-foot";
    let footMeta;
    if (state.op === "times") {
      footMeta = `${state.table}× times table · ${state.problems.length} facts`;
    } else if (state.op === "skip") {
      footMeta = `Skip counting · count by ${state.interval} · ${state.problems.length} sequences`;
    } else if (state.op === "bonds") {
      footMeta = `Number bonds · make ${state.total} · ${state.problems.length} bonds`;
    } else if (state.op === "fact") {
      footMeta = `Fact families · ${state.fam === "md" ? "× ÷" : "+ −"} · ${state.problems.length} families`;
    } else if (state.op === "time") {
      const precLabel = { hour: "to the hour", half: "to the half hour", quarter: "to the quarter hour", five: "to 5 minutes" }[state.prec] || "to the hour";
      footMeta = `Telling time · ${precLabel} · ${state.problems.length} clocks`;
    } else if (state.op === "money") {
      const setLabel = { pennies: "pennies & nickels", dimes: "pennies, nickels & dimes", coins: "coins to a dollar", bills: "bills & coins" }[state.coinset] || "coins";
      footMeta = `Counting money · ${setLabel} · ${state.problems.length} sets`;
    } else {
      const L = LEVELS[state.level];
      footMeta = `${OP_LABEL[state.op]} · ${L.label} (${L.min}–${L.max}) · ${state.count} problems`;
    }
    foot.innerHTML =
      `<span>${footMeta}</span>` +
      `<span>Free printable from herbeus.github.io/mathmint</span>`;
    sheet.appendChild(foot);

    return sheet;
  }

  function renderPreview() {
    const mount = $("#sheetMount");
    mount.innerHTML = "";
    mount.appendChild(sheetEl({ showAnswers: false, isKey: false }));
    if (state.op === "times") {
      $("#previewTag").textContent = `Times tables · ${state.table}×`;
    } else if (state.op === "skip") {
      $("#previewTag").textContent = `Skip counting · by ${state.interval}`;
    } else if (state.op === "bonds") {
      $("#previewTag").textContent = `Number bonds · make ${state.total}`;
    } else if (state.op === "fact") {
      $("#previewTag").textContent = `Fact families · ${state.fam === "md" ? "× and ÷" : "+ and −"}`;
    } else if (state.op === "time") {
      const t = { hour: "to the hour", half: "to the half hour", quarter: "to the quarter hour", five: "to 5 minutes" }[state.prec] || "to the hour";
      $("#previewTag").textContent = `Telling time · ${t}`;
    } else if (state.op === "money") {
      const t = { pennies: "pennies & nickels", dimes: "nickels & dimes", coins: "coins to a dollar", bills: "bills & coins" }[state.coinset] || "coins";
      $("#previewTag").textContent = `Counting money · ${t}`;
    } else {
      const L = LEVELS[state.level];
      $("#previewTag").textContent = `${OP_LABEL[state.op]} · ${L.label}`;
    }
  }

  function renderPrint() {
    const area = $("#printArea");
    area.innerHTML = "";
    area.appendChild(sheetEl({ showAnswers: false, isKey: false }));
    if (state.answerKey) {
      area.appendChild(sheetEl({ showAnswers: true, isKey: true }));
    }
  }

  function refresh() {
    renderPreview();
  }

  /* ---- interactions ---- */
  function wireSeg(id, key, cast) {
    const seg = $(id);
    if (!seg) return;
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      seg.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state[key] = cast(btn.dataset[key]); // data-op→op, data-level→level, data-cols→cols, data-table→table, data-interval→interval
      if (key === "op") applyOpVisibility();
      if (key === "op" || key === "level" || key === "table" || key === "interval" || key === "total" || key === "fam" || key === "prec" || key === "coinset") generate();
      refresh();
    });
  }

  // Show the right controls per mode: Table picker for times tables, Count-by
  // picker for skip counting, Level + count for everything else. Skip counting
  // is always full-width, so its layout picker is hidden too.
  function applyOpVisibility() {
    const isTimes = state.op === "times";
    const isSkip = state.op === "skip";
    const isBonds = state.op === "bonds";
    const isFact = state.op === "fact";
    const isTime = state.op === "time";
    const isMoney = state.op === "money";
    const tableField = $("#tableField");
    const intervalField = $("#intervalField");
    const totalField = $("#totalField");
    const famField = $("#famField");
    const precField = $("#precField");
    const coinsetField = $("#coinsetField");
    const levelField = $("#levelField");
    const countField = $("#countField");
    const layoutField = $("#layoutField");
    if (tableField) tableField.hidden = !isTimes;
    if (intervalField) intervalField.hidden = !isSkip;
    if (totalField) totalField.hidden = !isBonds;
    if (famField) famField.hidden = !isFact;
    if (precField) precField.hidden = !isTime;
    if (coinsetField) coinsetField.hidden = !isMoney;
    if (levelField) levelField.hidden = isTimes || isSkip || isBonds || isFact || isTime || isMoney;
    if (countField) countField.hidden = isTimes || isSkip || isBonds || isFact || isTime || isMoney;
    if (layoutField) layoutField.hidden = isSkip || isBonds || isFact || isTime || isMoney;
  }

  function init() {
    wireSeg("#opSeg", "op", (v) => v);
    wireSeg("#levelSeg", "level", (v) => parseInt(v, 10));
    wireSeg("#colSeg", "cols", (v) => parseInt(v, 10));
    wireSeg("#tableSeg", "table", (v) => parseInt(v, 10));
    wireSeg("#intervalSeg", "interval", (v) => parseInt(v, 10));
    wireSeg("#totalSeg", "total", (v) => parseInt(v, 10));
    wireSeg("#famSeg", "fam", (v) => v);
    wireSeg("#precSeg", "prec", (v) => v);
    wireSeg("#coinsetSeg", "coinset", (v) => v);

    $("#count").addEventListener("input", (e) => {
      state.count = parseInt(e.target.value, 10);
      $("#countVal").textContent = state.count;
      generate();
      refresh();
    });
    $("#title").addEventListener("input", (e) => {
      state.title = e.target.value;
      refresh();
    });
    $("#answerKey").addEventListener("change", (e) => {
      state.answerKey = e.target.checked;
    });

    $("#generateBtn").addEventListener("click", () => {
      generate();
      refresh();
      flash($("#generateBtn"));
    });

    $("#printBtn").addEventListener("click", () => {
      renderPrint();
      window.print();
    });

    // Pro waitlist (stored locally for now; wired to backend in Pro launch)
    $("#proForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const email = $("#proEmail").value.trim();
      if (!email) return;
      try {
        const list = JSON.parse(localStorage.getItem("mm_waitlist") || "[]");
        list.push({ email, t: Date.now() });
        localStorage.setItem("mm_waitlist", JSON.stringify(list));
      } catch (_) {}
      $("#proNote").textContent = "You're on the list 🌱 — we'll email " + email + " at launch.";
      $("#proForm").reset();
    });

    // default field visibility (deep-link params may override op below)
    applyOpVisibility();

    // honor deep-link params from SEO landing pages, e.g. /?op=mul&level=3&n=24
    applyUrlParams();

    // initial
    generate();
    refresh();
    loadCounter();
  }

  /* ---- deep-link preconfig (used by /worksheets/* landing pages) ---- */
  function applyUrlParams() {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch (_) { return; }
    if (![...params.keys()].length) return;

    const op = params.get("op");
    if (op && OP_LABEL[op]) state.op = op;

    const level = parseInt(params.get("level"), 10);
    if (level >= 1 && level <= 4) state.level = level;

    const table = parseInt(params.get("table"), 10);
    if (table >= 2 && table <= 12) state.table = table;

    const interval = parseInt(params.get("interval"), 10);
    if ([2, 5, 10].includes(interval)) state.interval = interval;

    const total = parseInt(params.get("total"), 10);
    if ([5, 10, 20].includes(total)) state.total = total;

    const fam = params.get("fam");
    if (fam === "as" || fam === "md") state.fam = fam;

    const prec = params.get("prec");
    if (["hour", "half", "quarter", "five"].includes(prec)) state.prec = prec;

    const coinset = params.get("set");
    if (["pennies", "dimes", "coins", "bills"].includes(coinset)) state.coinset = coinset;

    let n = parseInt(params.get("n"), 10);
    if (n >= 10 && n <= 40) {
      n = n % 2 === 0 ? n : n - 1; // slider is even-stepped
      state.count = n;
    }

    const title = params.get("title");
    if (title) state.title = title.slice(0, 48);

    // reflect into the controls so the UI matches the deep-linked config
    syncControls();
  }

  function syncControls() {
    const setActive = (segId, attr, val) => {
      const seg = $(segId);
      if (!seg) return;
      seg.querySelectorAll(".seg-btn").forEach((b) => {
        b.classList.toggle("is-active", b.dataset[attr] === String(val));
      });
    };
    setActive("#opSeg", "op", state.op);
    setActive("#levelSeg", "level", state.level);
    setActive("#colSeg", "cols", state.cols);
    setActive("#tableSeg", "table", state.table);
    setActive("#intervalSeg", "interval", state.interval);
    setActive("#totalSeg", "total", state.total);
    setActive("#famSeg", "fam", state.fam);
    setActive("#precSeg", "prec", state.prec);
    setActive("#coinsetSeg", "coinset", state.coinset);
    applyOpVisibility();

    const count = $("#count");
    if (count) count.value = state.count;
    const countVal = $("#countVal");
    if (countVal) countVal.textContent = state.count;
    const titleIn = $("#title");
    if (titleIn) titleIn.value = state.title;
  }

  /* ---- tiny niceties ---- */
  function flash(btn) {
    const txt = btn.textContent;
    btn.textContent = "Fresh set ✓";
    setTimeout(() => (btn.textContent = txt), 700);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function loadCounter() {
    let n = parseInt(localStorage.getItem("mm_made") || "0", 10);
    $("#madeCount").textContent = n.toLocaleString();
  }
  function bumpCounter() {
    let n = parseInt(localStorage.getItem("mm_made") || "0", 10) + 1;
    localStorage.setItem("mm_made", String(n));
    const el = $("#madeCount");
    if (el) el.textContent = n.toLocaleString();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
