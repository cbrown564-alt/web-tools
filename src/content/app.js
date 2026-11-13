import {
  newPlan,
  validatePlan,
  validateRow,
  importCsv,
  toCsv,
  compileMap,
  decisions,
} from "./model.js";
const manifest = JSON.parse(document.querySelector("#manifest").textContent),
  $ = (s) => document.querySelector(s),
  key = `web-tools:content:${manifest.project.id}:${manifest.inventorySha256}`;
let plan = newPlan(manifest),
  expectedRevision = "",
  conflict = false,
  storageFailed = false,
  selected = manifest.pages[0]?.url,
  offset = 0;
const known = new Set(manifest.pages.map((p) => p.url));
function message(text, error = false) {
  $("#message").textContent = text;
  $("#message").className = error ? "notice" : "";
}
function readSaved() {
  const raw = localStorage.getItem(key);
  return raw ? validatePlan(JSON.parse(raw), manifest) : null;
}
try {
  const saved = readSaved();
  if (saved) {
    plan = saved;
    expectedRevision = plan.revision;
  }
} catch (e) {
  storageFailed = true;
  message(
    `Saved decisions could not be loaded: ${e.message}. Edits remain available for download.`,
    true,
  );
}
function save() {
  if (conflict) {
    message(
      "Another tab changed this review. Download your copy or reload saved decisions before saving again.",
      true,
    );
    return;
  }
  try {
    const saved = readSaved();
    if ((saved?.revision || "") !== expectedRevision) {
      conflict = true;
      $("#reload").hidden = false;
      message(
        "Another tab changed this review. Download your copy or reload saved decisions.",
        true,
      );
      return;
    }
    const next = {
      ...plan,
      revision:
        globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    };
    localStorage.setItem(key, JSON.stringify(next));
    plan = next;
    expectedRevision = plan.revision;
    storageFailed = false;
    message("Saved in this browser.");
  } catch (e) {
    storageFailed = true;
    message(
      "Browser storage is unavailable. Your edits remain here; download a JSON backup before leaving.",
      true,
    );
  }
}
addEventListener("storage", (event) => {
  if (event.key === key) {
    conflict = true;
    $("#reload").hidden = false;
    message(
      "Another tab changed this review. Download your copy or reload saved decisions.",
      true,
    );
  }
});
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function filtered() {
  const query = $("#search").value.toLowerCase(),
    status = $("#filter").value;
  return manifest.pages.filter(
    (p) =>
      (!status || plan.rows.find((r) => r.url === p.url).decision === status) &&
      (p.title + " " + p.url + " " + (p.template?.group || ""))
        .toLowerCase()
        .includes(query),
  );
}
function counts() {
  const n = plan.rows.filter((r) => r.decision !== "undecided").length;
  $("#counts").textContent =
    `${n} of ${plan.rows.length} URLs decided. ${manifest.inventoryState === "partial" ? "Source inventory is partial." : ""}`;
}
function renderList() {
  const list = filtered();
  offset = Math.max(
    0,
    Math.min(offset, Math.floor(Math.max(0, list.length - 1) / 50) * 50),
  );
  $("#range").textContent = list.length
    ? `${offset + 1}–${Math.min(offset + 50, list.length)} of ${list.length} matching URLs`
    : "No matching pages";
  $("#pages").replaceChildren();
  for (const p of list.slice(offset, offset + 50)) {
    const li = document.createElement("li"),
      button = document.createElement("button");
    button.type = "button";
    button.textContent =
      (p.title || p.url) +
      " — " +
      plan.rows.find((r) => r.url === p.url).decision;
    button.title = p.url;
    button.setAttribute("aria-current", String(p.url === selected));
    button.onclick = () => {
      selected = p.url;
      renderEditor();
      renderList();
    };
    li.append(button);
    $("#pages").append(li);
  }
  $("#list-prev").disabled = offset === 0;
  $("#list-next").disabled = offset + 50 >= list.length;
  $("#prev").disabled = !list.length;
  $("#next").disabled = !list.length;
  counts();
}
function active() {
  return plan.rows.find((r) => r.url === selected);
}
function renderEditor() {
  const page = manifest.pages.find((p) => p.url === selected),
    row = active();
  $("#page-title").textContent = page.title || page.url;
  $("#source").textContent = page.url;
  $("#source").href = page.url;
  $("#facts").textContent =
    `${page.status ? `Observed HTTP ${page.status}` : "HTTP status unavailable"}; ${page.template?.group || "no template group"}; ${page.decodedBytes ?? "unknown"} HTML bytes.${page.redirects ? ` ${page.redirects} observed redirects → ${page.finalUrl}.` : ""}${page.error ? ` Collection: ${page.error}.` : ""}${page.canonicals?.length ? ` Canonical: ${page.canonicals.join(", ")}.` : ""}`;

  for (const f of [
    "decision",
    "destination",
    "redirectStatus",
    "removeStatus",
    "notes",
  ])
    $("#" + f).value = row[f];
  $("#destination-fields").hidden = row.decision !== "consolidate";
  $("#remove-fields").hidden = row.decision !== "remove";
  renderImage();
}
function renderImage() {
  const page = manifest.pages.find((p) => p.url === selected),
    device = $("#device").value,
    c = page.captures.find((c) => c.device === device),
    img = $("#capture"),
    open = $("#open-capture");
  img.hidden = !c?.file;
  $("#fit").closest("label").hidden = !c?.file;
  $(".capture-view").hidden = !c?.file;
  open.hidden = !c?.file;
  if (c?.file) {
    img.src = c.file;
    img.alt = `${page.title || page.url} — ${device} capture`;
    open.href = c.file;
    $("#capture-state").textContent =
      `Captured ${c.capturedAt || "with inventory"} · ${c.scope || "recorded capture"}`;
  } else {
    img.removeAttribute("src");
    $("#capture-state").textContent = c?.error
      ? `Capture unavailable: ${c.error}`
      : "No capture recorded for this page and device. Open the source page for context.";
  }
}
$("#capture").addEventListener("error", () => {
  $("#capture").hidden = true;
  $("#fit").closest("label").hidden = true;
  $(".capture-view").hidden = true;
  $("#capture-state").textContent =
    "Capture failed to open. Your decisions remain available; open the source page or restore the capture file.";
});
for (const f of [
  "decision",
  "destination",
  "redirectStatus",
  "removeStatus",
  "notes",
])
  $("#" + f).addEventListener(
    f === "notes" || f === "destination" ? "input" : "change",
    () => {
      const row = active();
      row[f] = ["redirectStatus", "removeStatus"].includes(f)
        ? Number($("#" + f).value)
        : $("#" + f).value;
      if (f === "decision") {
        if (row.decision !== "consolidate") {
          row.destination = "";
          $("#destination").value = "";
        }
        $("#destination-fields").hidden = row.decision !== "consolidate";
        $("#remove-fields").hidden = row.decision !== "remove";
      }
      save();
      renderList();
    },
  );
$("#search").oninput = () => {
  offset = 0;
  renderList();
};
$("#filter").onchange = () => {
  offset = 0;
  renderList();
};
$("#list-prev").onclick = () => {
  offset -= 50;
  renderList();
};
$("#list-next").onclick = () => {
  offset += 50;
  renderList();
};
for (const [id, step] of [
  ["prev", -1],
  ["next", 1],
])
  $("#" + id).onclick = () => {
    const list = filtered(),
      index = list.findIndex((p) => p.url === selected);
    selected = list[(index + step + list.length) % list.length].url;
    offset = Math.floor(list.findIndex((p) => p.url === selected) / 50) * 50;
    renderEditor();
    renderList();
  };
$("#device").onchange = renderImage;
$("#fit").onchange = () =>
  $(".capture-view").classList.toggle("read", !$("#fit").checked);
function checked() {
  for (const row of plan.rows) validateRow(row, known, manifest.site.baseUrl);
  return plan;
}
$("#json").onclick = () => {
  try {
    download(
      `${manifest.project.id}-decisions.json`,
      JSON.stringify(checked(), null, 2) + "\n",
      "application/json",
    );
    message("JSON backup downloaded.");
  } catch (e) {
    message(e.message, true);
  }
};
$("#csv").onclick = () => {
  try {
    download(
      `${manifest.project.id}-decisions.csv`,
      toCsv(checked()),
      "text/csv;charset=utf-8",
    );
    message("Spreadsheet downloaded as CSV.");
  } catch (e) {
    message(e.message, true);
  }
};
$("#map").onclick = () => {
  try {
    const map = compileMap(plan, manifest);
    download(
      `${manifest.project.id}-redirect-map.json`,
      JSON.stringify(map, null, 2) + "\n",
      "application/json",
    );
    message(
      `${map.rules.length} rules exported; ${map.coverage.undecided} URLs remain undecided.${map.complete ? "" : " This is a partial map."}`,
    );
  } catch (e) {
    message(e.message, true);
  }
};
$("#import").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > Math.max(10000000, manifest.pages.length * 40000))
      throw Error("Decision file exceeds the inventory import limit");
    const text = await file.text(),
      next = file.name.toLowerCase().endsWith(".csv")
        ? importCsv(text, plan, manifest)
        : validatePlan(JSON.parse(text), manifest);
    plan = next;
    plan.revision = expectedRevision;
    save();
    renderEditor();
    renderList();
  } catch (e) {
    message(`Import failed: ${e.message}. Existing decisions were kept.`, true);
  } finally {
    event.target.value = "";
  }
};
$("#reload").onclick = () => {
  try {
    plan = readSaved() || newPlan(manifest);
    expectedRevision = plan.revision;
    conflict = false;
    $("#reload").hidden = true;
    message("Loaded saved decisions.");
    renderEditor();
    renderList();
  } catch (e) {
    message(e.message, true);
  }
};
$("#reset").onclick = () => {
  if (
    !confirm(
      "Clear every decision and note in this review? Download a backup first if you need to retain them.",
    )
  )
    return;
  if (conflict) {
    message(
      "Reload saved decisions before clearing a conflicting review.",
      true,
    );
    return;
  }
  try {
    let saved;
    try {
      saved = readSaved();
    } catch {}
    if (saved && saved.revision !== expectedRevision) {
      conflict = true;
      $("#reload").hidden = false;
      message(
        "Another tab changed this review. Reload saved decisions before clearing.",
        true,
      );
      return;
    }
    localStorage.removeItem(key);
    expectedRevision = "";
  } catch {}
  plan = newPlan(manifest);
  save();
  renderEditor();
  renderList();
};
$("#project").textContent = manifest.project.name + " — Content decisions";
$("#scope").textContent =
  `${manifest.pages.length} URLs · inventory ${manifest.inventoryRun} · ${manifest.pages.filter((p) => p.captures.some((c) => c.file)).length} URLs have captures. Source observations include redirects and error pages.`;
for (const device of manifest.devices) {
  const option = document.createElement("option");
  option.value = device;
  option.textContent = device;
  $("#device").append(option);
}
if (innerWidth < 800) $("#navigation").open = false;
renderList();
renderEditor();
if (!storageFailed)
  message(
    "Changes save in this browser. Download a JSON backup to move them elsewhere.",
  );
