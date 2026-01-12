import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** =========================
 *  1) SUPABASE (eintragen)
 *  ========================= */
const SUPABASE_URL = "https://rmgofrcgqbgrhpcvqwtu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtZ29mcmNncWJncmhwY3Zxd3R1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNTM0MDMsImV4cCI6MjA4MzcyOTQwM30.WfyQEii6pTtrvQwWDrzd5udRASpzBXtFYhrBBebRL1M";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** =========================
 *  2) KONFIG
 *  ========================= */
const N = 1025; // logisches Artwork

// View (~16:9): 43*24=1032 -> 7 Dummy-Slots unsichtbar
const COLS_VIEW = 43;
const ROWS_VIEW = 24;
const TOTAL_VIEW = COLS_VIEW * ROWS_VIEW;

/** =========================
 *  3) DOM
 *  ========================= */
const stripsEl = document.getElementById("strips");
const ball = document.getElementById("ball");
const ballCtx = ball.getContext("2d");
const swatch = document.getElementById("swatch");
const commitBtn = document.getElementById("commit");
const metaGrid = document.getElementById("metaGrid");
const metaActive = document.getElementById("metaActive");

// Neue Slider (unter der Kugel)
const satEl = document.getElementById("sat");
const valEl = document.getElementById("val");
const satValEl = document.getElementById("satVal");
const valValEl = document.getElementById("valVal");

/** =========================
 *  4) STATE
 *  ========================= */
let state = { grid: Array(N).fill("#111111"), active: 0 };

// HSV-Controls (Hue kommt aus Kugel, S/V aus Slider)
let hue = 0; // 0..360
let sat = 1; // 0..1
let val = 1; // 0..1

let picked = "#ffffff";
swatch.style.background = picked;

metaGrid.textContent = `${COLS_VIEW}×${ROWS_VIEW} (~16:9), used ${N}/${TOTAL_VIEW}`;

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

  let r = 0,
    g = 0,
    b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

// Update picked color based on current HSV controls
function updatePickedFromHSV() {
  const rgb = hsvToRgb(hue, sat, val);
  picked = rgbToHex(rgb.r, rgb.g, rgb.b);
  swatch.style.background = picked;

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

      // Hue = angle, Sat = radius, Value fixed at 1 for display
      let ang = Math.atan2(dy, dx); // -pi..pi
      if (ang < 0) ang += Math.PI * 2; // 0..2pi
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

/**
 * Pick Hue from ball click (angle).
 * Sat/Val come from sliders, not the radius.
 */
function pickFromBall(ev) {
  const rect = ball.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const dx = ev.clientX - cx;
  const dy = ev.clientY - cy;

  const r = Math.min(rect.width, rect.height) / 2;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > r) return; // only inside circle

  let a = Math.atan2(dy, dx); // -pi..pi
  if (a < 0) a += Math.PI * 2; // 0..2pi
  hue = (a / (Math.PI * 2)) * 360;

  updatePickedFromHSV();
}

/** =========================
 *  7) GRID RENDER
 *  ========================= */
function renderGrid16x9() {
  stripsEl.innerHTML = "";
  const active = (state.active ?? 0) % N;
  metaActive.textContent = `${active}`;

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

  if (error) {
    console.error("loadState error:", error);
    alert("loadState error: " + (error.message || JSON.stringify(error)));
    throw error;
  }

  if (!data?.grid || data.grid.length !== N) {
    alert("bad grid: " + (data?.grid ? data.grid.length : "no grid"));
    throw new Error("bad grid");
  }

  state = { grid: data.grid, active: data.active ?? 0 };
  renderGrid16x9();
}

async function commitColor() {
  commitBtn.disabled = true;
  try {
    const { data, error } = await supabase.rpc("set_next_color", {
      p_color: picked,
    });
    if (error) throw error;

    // RPC returns new state
    if (data?.grid && data.grid.length === N) {
      state = { grid: data.grid, active: data.active ?? 0 };
      renderGrid16x9();
    }
  } catch (e) {
    console.error("commitColor error:", e);
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
  if (!satEl || !valEl) return;
  sat = Number(satEl.value) / 100;
  val = Number(valEl.value) / 100;
  updatePickedFromHSV();
}

/** =========================
 *  11) INIT
 *  ========================= */
commitBtn.addEventListener("click", () => commitColor());
ball.addEventListener("pointerdown", pickFromBall);

if (satEl) satEl.addEventListener("input", onSliderChange);
if (valEl) valEl.addEventListener("input", onSliderChange);

(async function main() {
  drawBall();

  // init S/V from slider values (defaults 100/100)
  if (satEl) sat = Number(satEl.value) / 100;
  if (valEl) val = Number(valEl.value) / 100;

  updatePickedFromHSV();

  await loadState();
  subscribeRealtime();
})();
