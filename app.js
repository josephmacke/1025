import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1) HIER EINTRAGEN:
const SUPABASE_URL = "https://rmgofrcgqbgrhpcvqwtu.supabase.co";
const SUPABASE_ANON_KEY = "rmgofrcgqbgrhpcvqwtu";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Logisches Artwork (1025)
const N = 1025;

// View (≈16:9) 43*24=1032 -> 7 dummy unsichtbar
const COLS_VIEW = 43,
  ROWS_VIEW = 24;
const TOTAL_VIEW = COLS_VIEW * ROWS_VIEW;

const stripsEl = document.getElementById("strips");
const ball = document.getElementById("ball");
const ballCtx = ball.getContext("2d");
const swatch = document.getElementById("swatch");
const commitBtn = document.getElementById("commit");
const metaGrid = document.getElementById("metaGrid");
const metaActive = document.getElementById("metaActive");

let state = { grid: Array(N).fill("#111111"), active: 0 };
let picked = "#ffffff";
swatch.style.background = picked;

metaGrid.textContent = `${COLS_VIEW}×${ROWS_VIEW} (~16:9), used ${N}/${TOTAL_VIEW}`;

function hex(n) {
  return n.toString(16).padStart(2, "0");
}
function rgbToHex(r, g, b) {
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function hsvToRgb(h, s, v) {
  const c = v * s,
    x = c * (1 - Math.abs((h / 60) % 2 - 1)),
    m = v - c;
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

function drawBall() {
  const cx = ball.width / 2,
    cy = ball.height / 2;
  const r = Math.min(cx, cy) - 2;
  const img = ballCtx.createImageData(ball.width, ball.height);

  for (let y = 0; y < ball.height; y++) {
    for (let x = 0; x < ball.width; x++) {
      const dx = x - cx,
        dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * ball.width + x) * 4;
      if (dist > r) {
        img.data[idx + 3] = 0;
        continue;
      }

      const ang = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
      const sat = Math.min(dist / r, 1);
      const hue = ang * 360;
      const rgb = hsvToRgb(hue, sat, 1);

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
  const x = Math.floor((ev.clientX - rect.left) * (ball.width / rect.width));
  const y = Math.floor((ev.clientY - rect.top) * (ball.height / rect.height));
  const px = ballCtx.getImageData(x, y, 1, 1).data;
  if (px[3] === 0) return;
  picked = rgbToHex(px[0], px[1], px[2]);
  swatch.style.background = picked;
}

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
      chip.classList.add("empty"); // 7 dummy -> unsichtbar via CSS
    }
    stripsEl.appendChild(chip);
  }
}

/**
 * Debug-friendly loadState:
 * - zeigt Fehler per alert
 * - loggt data/error in console
 */
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

  console.log("loadState data:", data);

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

    if (data?.grid && data.grid.length === N) {
      state = { grid: data.grid, active: data.active ?? 0 };
      renderGrid16x9();
    }
  } finally {
    commitBtn.disabled = false;
  }
}

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

commitBtn.addEventListener("click", () => commitColor());
ball.addEventListener("pointerdown", pickFromBall);

(async function main() {
  drawBall();
  await loadState();
  subscribeRealtime();
})();
