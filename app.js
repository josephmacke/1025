import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** =========================
 *  1) SUPABASE (eintragen)
 *  ========================= */
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** =========================
 *  2) KONFIG
 *  ========================= */
const N = 1025;

// View (~16:9): 43x24=1032 -> 7 Dummy-Slots unsichtbar
const COLS_VIEW = 43;
const ROWS_VIEW = 24;
const TOTAL_VIEW = COLS_VIEW * ROWS_VIEW;

/** =========================
 *  3) STATE
 *  ========================= */
let state = { grid: Array(N).fill("#111111"), active: 0 };

// HSV Controls
let hue = 0; // 0..360
let sat = 1; // 0..1
let val = 1; // 0..1
let picked = "#ffffff";

/** =========================
 *  4) DOM (wird in init() gesetzt)
 *  ========================= */
let stripsEl, ball, ballCtx, swatch, commitBtn, metaGrid, metaActive;
let satEl, valEl, satValEl, valValEl;

/** =========================
 *  5) HELPER
 *  ========================= */
function hex(n) {
  return n.toString(16).padStart(2, "0");
}
function rgbToHex(r, g, b) {
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// HSV -> RGB (h: 0..360, s: 0..1, v: 0..1)
function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;

  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function updatePickedFromHSV() {
  const rgb = hsvToRgb(hue, sat, val);
  picked = rgbToHex(rgb.r, rgb.g, rgb.b);

  if (swatch) swatch.style.background = picked;
  if (satValEl) satValEl.textContent = `${Math.round(sat * 100)}%`;
  if (valValEl) valValEl.textContent = `${Math.round(val * 100)}%`;
}

/** =========================
 *  6) COLOR WHEEL (draw only)
 *  ========================= */
function drawBall() {
  const cx = ball.width / 2;
  const cy = ball.height / 2;
  const r = Math.min(cx, cy) - 2;

  const img = ballCtx.createImageData(ball.width, ball.height);

  for (let y = 0; y < ball.height; y++) {
    for (let x = 0; x < ball.width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * ball.width + x) * 4;

      if (dist > r) {
        img.data[idx + 3] = 0;
        continue;
      }

      // Display: Hue by angle, Sat by radius, Value fixed at 1 (nur Visual)
      let ang = Math.atan2(dy, dx);
      if (ang < 0) ang += Math.PI * 2;

      const hueLocal = (ang / (Math.PI * 2)) * 360;
      const satLocal = Math.min(dist / r, 1);

      const rgb = hsvToRgb(hueLocal, satLocal, 1);

      img.data[idx] = rgb.r;
      img.data[idx + 1] = rgb.g;
      img.data[idx + 2] = rgb.b;
      img.data[idx + 3] = 255;
    }
  }

  ballCtx.putImageData(img, 0, 0);
}

function pickFromBall(ev) {
  const rect = ball.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const dx = ev.clientX - cx;
  const dy = ev.clientY - cy;

  const r = Math.min(rect.width, rect.height) / 2;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > r) return;

  let a = Math.atan2(dy, dx);
  if (a < 0) a += Math.PI * 2;
  hue = (a / (Math.PI * 2)) * 360;

  updatePickedFromHSV();
}

/** =========================
 *  7) GRID RENDER
 *  ========================= */
function renderGrid16x9() {
  stripsEl.innerHTML = "";
  const active = (state.active ?? 0) % N;

  if (metaActive) metaActive.textContent = `${active}`;

  for (let i = 0; i < TOTAL_VIEW; i++) {
    const chip = document.createElement("div");
    chip.className = "chip";

    if (i < N) {
      chip.style.background = state.grid[i] || "#111111";
      if (i === active) chip.classList.add("active");
    } else {
      chip.classList.add("empty");
    }

    stripsEl.appendChild(chip);
  }
}

/** =========================
 *  8) LOAD + COMMIT
 *  ========================= */
async function loadState() {
  const { data, error } = await supabase
    .from("fields_state")
    .select("grid, active")
    .eq("id", 1)
    .single();

  if (error) throw error;
  if (!data?.grid || data.grid.length !== N) throw new Error("bad grid");

  state = { grid: data.grid, active: data.active ?? 0 };
  renderGrid16x9();
}

async function commitColor() {
  commitBtn.disabled = true;
  try {
    // picked wird durch Slider/Hue immer aktuell gehalten
    const { data, error } = await supabase.rpc("set_next_color", { p_color: picked });
    if (error) throw error;

    if (data?.grid && data.grid.length === N) {
      state = { grid: data.grid, active: data.active ?? 0 };
      renderGrid16x9();
    }
  } catch (e) {
    console.error(e);
    alert(e?.message || String(e));
  } finally {
    commitBtn.disabled = false;
  }
}

/** =========================
 *  9) REALTIME
 *  ========================= */
function subscribeRealtime() {
  supabase
    .channel("fields_state_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "fields_state", filter: "id=eq.1" },
      (payload) => {
        const row = payload.new;
        if (row?.grid && row.grid.length === N) {
          state = { grid: row.grid, active: row.active ?? 0 };
          renderGrid16x9();
        }
      }
    )
    .subscribe();
}

/** =========================
 *  10) SLIDERS
 *  ========================= */
function onSliderChange() {
  sat = Number(satEl.value) / 100;
  val = Number(valEl.value) / 100;
  updatePickedFromHSV();
}

/** =========================
 *  11) INIT (DOM READY)
 *  ========================= */
async function init() {
  // DOM greifen (nachdem alles existiert)
  stripsEl = document.getElementById("strips");
  ball = document.getElementById("ball");
  swatch = document.getElementById("swatch");
  commitBtn = document.getElementById("commit");
  metaGrid = document.getElementById("metaGrid");
  metaActive = document.getElementById("metaActive");

  satEl = document.getElementById("sat");
  valEl = document.getElementById("val");
  satValEl = document.getElementById("satVal");
  valValEl = document.getElementById("valVal");

  // Harte Checks (sonst merkst du nie, dass IDs nicht passen)
  if (!stripsEl || !ball || !swatch || !commitBtn) {
    alert("Fehlende DOM-IDs: strips/ball/swatch/commit. Bitte IDs in index.html prüfen.");
    return;
  }
  if (!satEl || !valEl) {
    alert("Slider nicht gefunden. Bitte prüfe: <input id=\"sat\"> und <input id=\"val\"> in index.html");
    return;
  }

  ballCtx = ball.getContext("2d");

  // Meta
  if (metaGrid) metaGrid.textContent = `${COLS_VIEW}×${ROWS_VIEW} (~16:9), used ${N}/${TOTAL_VIEW}`;

  // Listener
  ball.addEventListener("pointerdown", pickFromBall);
  commitBtn.addEventListener("click", commitColor);

  satEl.addEventListener("input", onSliderChange);
  valEl.addEventListener("input", onSliderChange);

  // init HSV aus Slidern
  sat = Number(satEl.value) / 100;
  val = Number(valEl.value) / 100;

  drawBall();
  updatePickedFromHSV(); // <-- wichtig: initiale Farbe setzen

  // DB
  await loadState();
  subscribeRealtime();
}

// garantiert DOM-ready
window.addEventListener("DOMContentLoaded", () => {
  init().catch((e) => {
    console.error(e);
    alert(e?.message || String(e));
  });
});
