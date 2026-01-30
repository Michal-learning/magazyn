// ====== Dane w pamięci (MVP bez zapisu) ======
const state = {
  // partie magazynowe
  lots: [],

  // magazyn maszyn
  machinesStock: [],

  // GLOBALNY katalog części: skuLower -> { sku, name }
  partsCatalog: new Map(),

  // Dostawcy: name -> { prices: Map(skuLower -> price) }
  suppliers: new Map(),

  // BOM maszyn
  machineCatalog: [
    {
      code: "M-IR01",
      name: "Maszyna IR-01",
      bom: [
        { sku: "SEN-IR01", qty: 1 },
        { sku: "SCR-M6-30", qty: 8 },
        { sku: "BRG-6204", qty: 2 }
      ]
    },
    {
      code: "M-BASIC",
      name: "Maszyna BASIC",
      bom: [
        { sku: "SCR-M6-30", qty: 20 },
        { sku: "BLT-A32", qty: 1 }
      ]
    }
  ],

  // dostawa
  currentDelivery: {
    supplier: "Wybierz dostawcę...",
    dateISO: "",
    items: [] // {id, sku, name, qty, price}
  },

  // produkcja
  currentBuild: {
    dateISO: "",
    items: [] // {id, machineCode, machineName, qty}
  }
};

let _id = 1;
function nextId() { return _id++; }

const fmtPLN = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

// progi podświetlania w podsumowaniu per SKU (jeśli masz suwaki, to je podepniemy)
let LOW_WARN = 100;
let LOW_DANGER = 50;

let manualPlanGenerated = false;

function stockClass(totalQty) {
  if (totalQty < LOW_DANGER) return "stock-danger";
  if (totalQty < LOW_WARN) return "stock-warn";
  return "";
}

// ====== Elementy UI ======
const els = {

    machineCodeInput: document.getElementById("machineCodeInput"),
machineNameInput: document.getElementById("machineNameInput"),
addMachineBtn: document.getElementById("addMachineBtn"),
machineManageSelect: document.getElementById("machineManageSelect"),
bomSkuSelect: document.getElementById("bomSkuSelect"),
bomQtyInput: document.getElementById("bomQtyInput"),
addBomItemBtn: document.getElementById("addBomItemBtn"),
bomBody: document.querySelector("#bomTable tbody"),

  // magazyn części
  searchParts: document.getElementById("searchParts"),
  seedDemoBtn: document.getElementById("seedDemoBtn"),
  skuSummaryBody: document.querySelector("#skuSummaryTable tbody"),
  lotsBody: document.querySelector("#partsTable tbody"),
  warehouseTotal: document.getElementById("warehouseTotal"),

  // suwaki progów (opcjonalne)
  warnRange: document.getElementById("warnRange"),
  dangerRange: document.getElementById("dangerRange"),
  warnValue: document.getElementById("warnValue"),
  dangerValue: document.getElementById("dangerValue"),

  // dostawy
  supplierSelect: document.getElementById("supplierSelect"),
  deliveryDate: document.getElementById("deliveryDate"),
  supplierPartsSelect: document.getElementById("supplierPartsSelect"),
  deliveryQty: document.getElementById("deliveryQty"),
  deliveryPrice: document.getElementById("deliveryPrice"),
  addDeliveryItemBtn: document.getElementById("addDeliveryItemBtn"),
  deliveryItemsBody: document.querySelector("#deliveryItemsTable tbody"),
  itemsCount: document.getElementById("itemsCount"),
  itemsTotal: document.getElementById("itemsTotal"),
  finalizeDeliveryBtn: document.getElementById("finalizeDeliveryBtn"),

  // produkcja
  machineSelect: document.getElementById("machineSelect"),
  buildQty: document.getElementById("buildQty"),
  buildDate: document.getElementById("buildDate"),
  addBuildItemBtn: document.getElementById("addBuildItemBtn"),
  buildItemsBody: document.querySelector("#buildItemsTable tbody"),
  buildItemsCount: document.getElementById("buildItemsCount"),
  finalizeBuildBtn: document.getElementById("finalizeBuildBtn"),
  missingBox: document.getElementById("missingBox"),
  missingList: document.getElementById("missingList"),
  consumeMode: document.getElementById("consumeMode"),
  manualConsumeBox: document.getElementById("manualConsumeBox"),
  manualConsumeUI: document.getElementById("manualConsumeUI"),

  // magazyn maszyn
  searchMachines: document.getElementById("searchMachines"),
  machinesStockBody: document.querySelector("#machinesStockTable tbody"),

  // NOWE: katalog części + dostawcy
  partSkuInput: document.getElementById("partSkuInput"),
  partNameInput: document.getElementById("partNameInput"),
  addPartBtn: document.getElementById("addPartBtn"),
  partsCatalogBody: document.querySelector("#partsCatalogTable tbody"),

  supplierNameInput: document.getElementById("supplierNameInput"),
  addSupplierBtn: document.getElementById("addSupplierBtn"),
  supplierManageSelect: document.getElementById("supplierManageSelect"),
  supplierSkuSelect: document.getElementById("supplierSkuSelect"),
  supplierPriceInput: document.getElementById("supplierPriceInput"),
  setSupplierPriceBtn: document.getElementById("setSupplierPriceBtn"),
  supplierPriceBody: document.querySelector("#supplierPriceTable tbody")
};

// ====== Utils ======
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(str) { return escapeHtml(str).replaceAll('"', "&quot;"); }

function normSku(sku) { return String(sku || "").trim(); }
function skuKey(sku) { return normSku(sku).toLowerCase(); }

// ====== Katalog części (globalny) ======
function upsertPart(sku, name) {
  const s = normSku(sku);
  const n = String(name || "").trim();
  if (!s || !n) return { ok: false, msg: "Podaj SKU i nazwę." };

  const key = skuKey(s);
  if (state.partsCatalog.has(key)) {
    // aktualizuj nazwę
    state.partsCatalog.set(key, { sku: s, name: n });
    return { ok: true, msg: "Zaktualizowano część." };
  }
  state.partsCatalog.set(key, { sku: s, name: n });
  return { ok: true, msg: "Dodano część." };
}

function getPartName(sku) {
  const key = skuKey(sku);
  const it = state.partsCatalog.get(key);
  return it ? it.name : String(sku || "").toUpperCase();
}

function renderPartsCatalogTable() {
  if (!els.partsCatalogBody) return;

  const rows = Array.from(state.partsCatalog.values())
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));

  els.partsCatalogBody.innerHTML = rows.map(p => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td><span class="badge">${escapeHtml(p.sku)}</span></td>
    </tr>
  `).join("");
}

// ====== Dostawcy + cenniki ======
function ensureSupplier(name) {
  const n = String(name || "").trim();
  if (!n) return null;
  if (!state.suppliers.has(n)) state.suppliers.set(n, { prices: new Map() });
  return n;
}

function setSupplierPrice(supplierName, sku, price) {
  const n = ensureSupplier(supplierName);
  if (!n) return { ok: false, msg: "Podaj nazwę dostawcy." };

  const s = normSku(sku);
  if (!s) return { ok: false, msg: "Podaj SKU." };

  const p = Math.max(0, Number(price || 0));
  const key = skuKey(s);

  // SKU musi istnieć w katalogu (żeby nie robić śmietnika)
  if (!state.partsCatalog.has(key)) {
    return { ok: false, msg: "Najpierw dodaj to SKU do katalogu części." };
  }

  state.suppliers.get(n).prices.set(key, p);
  return { ok: true, msg: "Ustawiono cenę." };
}

function renderSupplierSelects() {
  // select w dostawie
  if (els.supplierSelect) {
    const names = ["Wybierz dostawcę...", ...Array.from(state.suppliers.keys()).sort((a,b)=>a.localeCompare(b,"pl"))];
    els.supplierSelect.innerHTML = names.map(x => `<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join("");
    if (!names.includes(state.currentDelivery.supplier)) state.currentDelivery.supplier = "Wybierz dostawcę...";
    els.supplierSelect.value = state.currentDelivery.supplier;
  }

  // select w panelu zarządzania dostawcą
  if (els.supplierManageSelect) {
    const names = Array.from(state.suppliers.keys()).sort((a,b)=>a.localeCompare(b,"pl"));
    els.supplierManageSelect.innerHTML = names.length
      ? names.map(x => `<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join("")
      : `<option value="">(brak dostawców)</option>`;
  }

  renderSupplierSkuDropdown();
  renderSupplierPriceTable();
  renderSupplierPartsForDelivery();
}

function renderSupplierSkuDropdown() {
  if (!els.supplierSkuSelect) return;
  const parts = Array.from(state.partsCatalog.values())
    .sort((a,b)=>a.name.localeCompare(b.name,"pl"));

  els.supplierSkuSelect.innerHTML = parts.length
    ? parts.map(p => `<option value="${escapeAttr(p.sku)}">${escapeHtml(p.name)} (${escapeHtml(p.sku)})</option>`).join("")
    : `<option value="">(dodaj części do katalogu)</option>`;
}

function currentManagedSupplier() {
  const val = els.supplierManageSelect?.value || "";
  return state.suppliers.has(val) ? val : "";
}

function renderSupplierPriceTable() {
  if (!els.supplierPriceBody) return;
  const sup = currentManagedSupplier();
  if (!sup) {
    els.supplierPriceBody.innerHTML = "";
    return;
  }

  const prices = state.suppliers.get(sup).prices;
  const rows = Array.from(prices.entries()).map(([skuLower, price]) => {
    const part = state.partsCatalog.get(skuLower);
    return {
      sku: part?.sku || skuLower.toUpperCase(),
      name: part?.name || skuLower.toUpperCase(),
      price
    };
  }).sort((a,b)=>a.name.localeCompare(b.name,"pl"));

  els.supplierPriceBody.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td><span class="badge">${escapeHtml(r.sku)}</span></td>
      <td class="right">${fmtPLN.format(r.price)}</td>
    </tr>
  `).join("");
}

// ====== Nowa dostawa (lista części z cennika dostawcy) ======
function supplierPriceForSku(supplierName, sku) {
  const sup = state.suppliers.get(supplierName);
  if (!sup) return null;
  const key = skuKey(sku);
  return sup.prices.has(key) ? sup.prices.get(key) : null;
}

function renderSupplierPartsForDelivery() {
  if (!els.supplierPartsSelect) return;

  const supplier = els.supplierSelect?.value || "Wybierz dostawcę...";
  state.currentDelivery.supplier = supplier;

  if (!state.suppliers.has(supplier)) {
    els.supplierPartsSelect.innerHTML = "";
    els.supplierPartsSelect.disabled = true;
    els.addDeliveryItemBtn.disabled = true;
    els.deliveryPrice.value = "0";
    return;
  }

  const prices = state.suppliers.get(supplier).prices;
  const rows = Array.from(prices.entries()).map(([skuLower, price]) => {
    const part = state.partsCatalog.get(skuLower);
    return {
      sku: part?.sku || skuLower.toUpperCase(),
      name: part?.name || skuLower.toUpperCase(),
      price
    };
  }).sort((a,b)=>a.name.localeCompare(b.name,"pl"));

  els.supplierPartsSelect.innerHTML = rows.map((it, idx) => `
    <option value="${idx}" data-sku="${escapeAttr(it.sku)}" data-price="${it.price}">
      ${escapeHtml(it.name)} (${escapeHtml(it.sku)}) • ${fmtPLN.format(it.price)}
    </option>
  `).join("");

  els.supplierPartsSelect.disabled = rows.length === 0;
  els.addDeliveryItemBtn.disabled = rows.length === 0;

  if (rows.length > 0) {
    els.deliveryPrice.value = String(rows[0].price ?? 0);
  } else {
    els.deliveryPrice.value = "0";
  }
}

function onDeliveryPartChange() {
  const opt = els.supplierPartsSelect?.selectedOptions?.[0];
  if (!opt) return;
  const price = Number(opt.dataset.price || 0);
  els.deliveryPrice.value = String(price);
}

function addDeliveryItem() {
  const supplier = state.currentDelivery.supplier;
  if (!state.suppliers.has(supplier)) return alert("Wybierz dostawcę z listy.");

  const opt = els.supplierPartsSelect?.selectedOptions?.[0];
  if (!opt) return alert("Wybierz część.");

  const sku = String(opt.dataset.sku || "").trim();
  const name = getPartName(sku);

  const qty = Math.max(1, Math.floor(Number(els.deliveryQty.value) || 1));
  const price = Math.max(0, Number(els.deliveryPrice.value) || 0); // można nadpisać ręcznie

  state.currentDelivery.items.push({
    id: nextId(),
    sku,
    name,
    qty,
    price
  });

  renderDeliveryItems();
}

function renderDeliveryItems() {
  const rows = state.currentDelivery.items;

  els.deliveryItemsBody.innerHTML = rows.map(it => `
    <tr>
      <td>${escapeHtml(it.name)} <span class="badge">${escapeHtml(it.sku)}</span></td>
      <td class="right">${it.qty}</td>
      <td class="right">${fmtPLN.format(it.price)}</td>
      <td class="right">${fmtPLN.format(it.qty * it.price)}</td>
      <td class="right"><button class="iconBtn" data-remove="${it.id}">Usuń</button></td>
    </tr>
  `).join("");

  const total = rows.reduce((sum, it) => sum + it.qty * it.price, 0);
  els.itemsCount.textContent = String(rows.length);
  els.itemsTotal.textContent = fmtPLN.format(total);
}

function addLot({ name, sku, supplier, qty, unitPrice }) {
  const cleanSku = normSku(sku);
  const cleanName = String(name || "").trim();
  const cleanSupplier = String(supplier || "").trim();
  const q = Math.max(0, Math.floor(Number(qty || 0)));
  const price = Math.max(0, Number(unitPrice || 0));
  if (!cleanSku || !cleanName || q <= 0) return;

  const existing = state.lots.find(l =>
    skuKey(l.sku) === skuKey(cleanSku) &&
    (l.supplier || "").toLowerCase() === cleanSupplier.toLowerCase() &&
    Number(l.unitPrice) === Number(price)
  );

  if (existing) {
    existing.qty += q;
    return;
  }

  state.lots.push({
    id: nextId(),
    name: cleanName,
    sku: cleanSku,
    supplier: cleanSupplier,
    unitPrice: price,
    qty: q
  });
}

function finalizeDelivery() {
  const supplier = state.currentDelivery.supplier;
  if (!state.suppliers.has(supplier)) return alert("Wybierz dostawcę.");
  if (state.currentDelivery.items.length === 0) return alert("Dodaj przynajmniej jedną pozycję.");

  state.currentDelivery.dateISO = els.deliveryDate.value || "";

  for (const it of state.currentDelivery.items) {
    // upewnij się, że SKU istnieje w katalogu
    if (!state.partsCatalog.has(skuKey(it.sku))) {
      upsertPart(it.sku, it.name);
    }
    addLot({ name: it.name, sku: it.sku, supplier, qty: it.qty, unitPrice: it.price });
  }

  state.currentDelivery.items = [];
  renderDeliveryItems();

  renderSkuSummary();
  renderLotsTable();
  renderWarehouseTotal();

  refreshManualConsumeUI();
  alert("Dostawa zapisana (partie dodane).");
}

// ====== Magazyn części: render ======
function renderMachineManageSelect() {
  if (!els.machineManageSelect) return;
  els.machineManageSelect.innerHTML = state.machineCatalog
    .slice()
    .sort((a,b)=>a.name.localeCompare(b.name,"pl"))
    .map(m => `<option value="${escapeAttr(m.code)}">${escapeHtml(m.name)} (${escapeHtml(m.code)})</option>`)
    .join("");
}

function renderBomSkuSelect() {
  if (!els.bomSkuSelect) return;
  const parts = Array.from(state.partsCatalog.values())
    .sort((a,b)=>a.name.localeCompare(b.name,"pl"));
  els.bomSkuSelect.innerHTML = parts.length
    ? parts.map(p => `<option value="${escapeAttr(p.sku)}">${escapeHtml(p.name)} (${escapeHtml(p.sku)})</option>`).join("")
    : `<option value="">(dodaj części do katalogu)</option>`;
}

function getManagedMachine() {
  const code = els.machineManageSelect?.value || "";
  return state.machineCatalog.find(m => m.code === code) || null;
}

function renderBomTable() {
  if (!els.bomBody) return;
  const m = getManagedMachine();
  if (!m) { els.bomBody.innerHTML = ""; return; }

  els.bomBody.innerHTML = (m.bom || []).map((b, idx) => `
    <tr>
      <td>${escapeHtml(getPartName(b.sku))}</td>
      <td><span class="badge">${escapeHtml(b.sku)}</span></td>
      <td class="right">${Number(b.qty || 0)}</td>
      <td class="right"><button class="iconBtn" data-del-bom="${idx}">Usuń</button></td>
    </tr>
  `).join("");
}

function addMachine(code, name) {
  const c = String(code || "").trim();
  const n = String(name || "").trim();
  if (!c || !n) return { ok:false, msg:"Podaj kod i nazwę maszyny." };

  if (state.machineCatalog.some(m => m.code.toLowerCase() === c.toLowerCase())) {
    return { ok:false, msg:"Taki kod maszyny już istnieje." };
  }

  state.machineCatalog.push({ code: c, name: n, bom: [] });

  // odśwież select do produkcji też
  renderMachineSelect();
  renderMachineManageSelect();

  return { ok:true, msg:"Dodano maszynę." };
}

function addBomItem(machineCode, sku, qty) {
  const m = state.machineCatalog.find(x => x.code === machineCode);
  if (!m) return { ok:false, msg:"Nie znaleziono maszyny." };

  const s = String(sku || "").trim();
  if (!s) return { ok:false, msg:"Wybierz SKU." };

  const q = Math.max(1, Math.floor(Number(qty || 1)));
  const key = skuKey(s);

  // SKU musi istnieć globalnie
  if (!state.partsCatalog.has(key)) {
    return { ok:false, msg:"Najpierw dodaj to SKU do katalogu części." };
  }

  // jeśli już jest w BOM, to sumuj ilości (prościej)
  const existing = m.bom.find(b => skuKey(b.sku) === key);
  if (existing) existing.qty += q;
  else m.bom.push({ sku: s, qty: q });

  return { ok:true, msg:"Dodano do BOM." };
}
function renderSkuSummary() {
  const q = (els.searchParts.value || "").trim().toLowerCase();
  const map = new Map();

  for (const lot of state.lots) {
    if (q) {
      const ok = (lot.name || "").toLowerCase().includes(q) || (lot.sku || "").toLowerCase().includes(q);
      if (!ok) continue;
    }
    const key = skuKey(lot.sku);
    if (!map.has(key)) map.set(key, { name: lot.name, sku: lot.sku, totalQty: 0, totalValue: 0 });

    const row = map.get(key);
    const qty = Number(lot.qty || 0);
    const price = Number(lot.unitPrice || 0);
    row.totalQty += qty;
    row.totalValue += qty * price;
  }

  const rows = Array.from(map.values()).sort((a,b)=>a.name.localeCompare(b.name,"pl"));
  els.skuSummaryBody.innerHTML = rows.map(r => `
    <tr class="${stockClass(r.totalQty)}">
      <td>${escapeHtml(r.name)}</td>
      <td><span class="badge">${escapeHtml(r.sku)}</span></td>
      <td class="right">${r.totalQty}</td>
      <td class="right">${fmtPLN.format(r.totalValue)}</td>
    </tr>
  `).join("");
}

function renderLotsTable() {
  const q = (els.searchParts.value || "").trim().toLowerCase();
  const rows = state.lots
    .filter(l => {
      if (!q) return true;
      return (l.name || "").toLowerCase().includes(q) || (l.sku || "").toLowerCase().includes(q);
    })
    .sort((a,b)=>{
      const n = (a.name||"").localeCompare(b.name||"","pl");
      if (n !== 0) return n;
      return Number(a.unitPrice||0) - Number(b.unitPrice||0);
    });

  els.lotsBody.innerHTML = rows.map(l => {
    const value = Number(l.qty||0) * Number(l.unitPrice||0);
    return `
      <tr>
        <td>${escapeHtml(l.name)}</td>
        <td><span class="badge">${escapeHtml(l.sku)}</span></td>
        <td>${escapeHtml(l.supplier || "-")}</td>
        <td class="right">${fmtPLN.format(l.unitPrice || 0)}</td>
        <td class="right">${Number(l.qty || 0)}</td>
        <td class="right">${fmtPLN.format(value)}</td>
      </tr>
    `;
  }).join("");
}

function renderWarehouseTotal() {
  const total = state.lots.reduce((sum, lot) => sum + Number(lot.qty||0)*Number(lot.unitPrice||0), 0);
  if (els.warehouseTotal) els.warehouseTotal.textContent = fmtPLN.format(total);
}

// ====== Produkcja (FIFO + ręczny) ======
function renderMachineSelect() {
  els.machineSelect.innerHTML = state.machineCatalog.map(m => `
    <option value="${escapeAttr(m.code)}">${escapeHtml(m.name)} (${escapeHtml(m.code)})</option>
  `).join("");
}

function renderBuildItems() {
  const rows = state.currentBuild.items;
  els.buildItemsBody.innerHTML = rows.map(it => `
    <tr>
      <td>${escapeHtml(it.machineName)} <span class="badge">${escapeHtml(it.machineCode)}</span></td>
      <td class="right">${it.qty}</td>
      <td class="right"><button class="iconBtn" data-remove-build="${it.id}">Usuń</button></td>
    </tr>
  `).join("");
  els.buildItemsCount.textContent = String(rows.length);
}

function addBuildItem() {
  const code = els.machineSelect.value;
  const qty = Math.max(1, Math.floor(Number(els.buildQty.value) || 1));
  const machine = state.machineCatalog.find(m => m.code === code);
  if (!machine) return alert("Nie znaleziono maszyny.");

  state.currentBuild.items.push({ id: nextId(), machineCode: machine.code, machineName: machine.name, qty });

  els.missingBox.hidden = true;
  els.missingList.innerHTML = "";
  manualPlanGenerated = false;

  renderBuildItems();
  refreshManualConsumeUI();
}

function totalQtyBySku(skuLowerOrSku) {
  const key = skuKey(skuLowerOrSku);
  return state.lots
    .filter(l => skuKey(l.sku) === key)
    .reduce((sum, l) => sum + Number(l.qty || 0), 0);
}

function consumeSkuFIFO(skuLowerOrSku, qtyNeeded) {
  const key = skuKey(skuLowerOrSku);
  let remaining = Math.max(0, Math.floor(Number(qtyNeeded || 0)));

  const lots = state.lots
    .filter(l => skuKey(l.sku) === key && Number(l.qty || 0) > 0)
    .sort((a,b)=>a.id-b.id);

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(Number(lot.qty||0), remaining);
    lot.qty -= take;
    remaining -= take;
  }

  state.lots = state.lots.filter(l => Number(l.qty || 0) > 0);
  return remaining === 0;
}

function computeMissingPartsForBuild() {
  const needed = new Map(); // skuLower -> qty
  for (const bi of state.currentBuild.items) {
    const machine = state.machineCatalog.find(m => m.code === bi.machineCode);
    if (!machine) continue;

    for (const b of machine.bom) {
      const add = Number(b.qty||0) * Number(bi.qty||0);
      const key = skuKey(b.sku);
      needed.set(key, (needed.get(key) || 0) + add);
    }
  }

  const missing = [];
  for (const [skuLower, qtyNeeded] of needed.entries()) {
    const available = totalQtyBySku(skuLower);
    if (available < qtyNeeded) {
      missing.push({ sku: skuLower, needed: qtyNeeded, available, missing: qtyNeeded - available });
    }
  }

  return { needed, missing };
}

function showMissing(missing) {
  if (!missing.length) {
    els.missingBox.hidden = true;
    els.missingList.innerHTML = "";
    return;
  }
  els.missingBox.hidden = false;
  els.missingList.innerHTML = missing.map(m => `
    <li><strong>${escapeHtml(m.sku.toUpperCase())}</strong>: brakuje ${m.missing} (potrzeba ${m.needed}, jest ${m.available})</li>
  `).join("");
}

function getLotsForSku(skuLower) {
  return state.lots
    .filter(l => skuKey(l.sku) === skuLower && Number(l.qty||0) > 0)
    .sort((a,b)=>a.id-b.id);
}

function consumeFromLotsByPlan(planMap) {
  for (const [lotIdStr, qtyStr] of Object.entries(planMap)) {
    const lotId = Number(lotIdStr);
    const take = Math.max(0, Math.floor(Number(qtyStr || 0)));
    if (!take) continue;

    const lot = state.lots.find(l => Number(l.id) === lotId);
    if (!lot) continue;

    lot.qty = Number(lot.qty || 0) - take;
  }
  state.lots = state.lots.filter(l => Number(l.qty || 0) > 0);
}

function buildManualConsumeUI(neededMap) {
  const parts = [];
  for (const [skuLower, qtyNeeded] of neededMap.entries()) {
    const lots = getLotsForSku(skuLower);
    const skuLabel = skuLower.toUpperCase();

    parts.push(`
      <div class="consumePart">
        <div><strong>${escapeHtml(skuLabel)}</strong> • potrzeba <strong>${qtyNeeded}</strong></div>
        <div class="consumeGrid">
          ${lots.map(lot => `
            <div class="lotRow">
              <div>
                <span class="badge">${escapeHtml(lot.sku)}</span>
                ${escapeHtml(lot.supplier || "-")} • ${fmtPLN.format(lot.unitPrice || 0)}
                <span class="muted"> (dostępne: ${Number(lot.qty || 0)})</span>
              </div>
              <input
                type="number"
                min="0"
                step="1"
                value="0"
                data-lotid="${lot.id}"
                data-sku="${escapeAttr(skuLower)}"
                data-max="${Number(lot.qty || 0)}"
              />
            </div>
          `).join("")}
        </div>
      </div>
    `);
  }

  els.manualConsumeUI.innerHTML = parts.join("");
  els.manualConsumeBox.hidden = false;
}

function refreshManualConsumeUI() {
  const isManual = (els.consumeMode?.value === "manual");
  if (!isManual) return;

  els.manualConsumeBox.hidden = false;

  if (state.currentBuild.items.length === 0) {
    els.manualConsumeUI.innerHTML = "(Dodaj maszyny do listy, wtedy pokażę wybór partii.)";
    manualPlanGenerated = false;
    return;
  }

  const { needed, missing } = computeMissingPartsForBuild();
  if (missing.length) {
    showMissing(missing);
    els.manualConsumeUI.innerHTML = "(Najpierw uzupełnij braki części, wtedy pojawi się wybór partii.)";
    manualPlanGenerated = false;
    return;
  }

  showMissing([]);
  buildManualConsumeUI(needed);
  manualPlanGenerated = true;
}

function addToMachinesStock(code, name, qty) {
  const existing = state.machinesStock.find(x => x.code === code);
  if (existing) existing.qty += qty;
  else state.machinesStock.push({ code, name, qty });
}

function finalizeBuild() {
  if (state.currentBuild.items.length === 0) return alert("Dodaj przynajmniej jedną maszynę do listy.");

  state.currentBuild.dateISO = els.buildDate.value || "";

  const { needed, missing } = computeMissingPartsForBuild();
  if (missing.length) {
    showMissing(missing);
    refreshManualConsumeUI();
    return;
  }

  const mode = els.consumeMode?.value || "fifo";

  if (mode === "manual") {
    const inputCount = els.manualConsumeUI?.querySelectorAll("input[data-lotid]")?.length || 0;
    if (!manualPlanGenerated || inputCount === 0) {
      refreshManualConsumeUI();
      return;
    }

    const inputs = Array.from(els.manualConsumeUI.querySelectorAll("input[data-lotid]"));
    const plan = {};
    const perSkuSum = new Map();

    for (const inp of inputs) {
      const lotId = inp.dataset.lotid;
      const skuLower = (inp.dataset.sku || "").toLowerCase();
      const max = Number(inp.dataset.max || 0);
      let val = Math.max(0, Math.floor(Number(inp.value || 0)));
      if (val > max) val = max;
      inp.value = String(val);

      if (val > 0) plan[lotId] = val;
      perSkuSum.set(skuLower, (perSkuSum.get(skuLower) || 0) + val);
    }

    const errors = [];
    for (const [skuLower, qtyNeeded] of needed.entries()) {
      const sum = perSkuSum.get(skuLower) || 0;
      if (sum !== qtyNeeded) errors.push(`${skuLower.toUpperCase()}: wybrałeś ${sum}, potrzeba ${qtyNeeded}`);
    }

    if (errors.length) return alert("Ręczny wybór nie pasuje:\n\n" + errors.join("\n"));

    consumeFromLotsByPlan(plan);
  } else {
    for (const [skuLower, qtyNeeded] of needed.entries()) {
      const ok = consumeSkuFIFO(skuLower, qtyNeeded);
      if (!ok) return alert("Coś poszło nie tak przy odejmowaniu części (FIFO).");
    }
  }

  for (const bi of state.currentBuild.items) {
    addToMachinesStock(bi.machineCode, bi.machineName, bi.qty);
  }

  state.currentBuild.items = [];
  renderBuildItems();
  showMissing([]);
  els.manualConsumeUI.innerHTML = "";
  els.manualConsumeBox.hidden = true;
  manualPlanGenerated = false;

  renderSkuSummary();
  renderLotsTable();
  renderWarehouseTotal();
  renderMachinesStock();

  alert("Produkcja zrealizowana: części odjęte, maszyny dodane.");
}

// ====== Magazyn maszyn ======
function renderMachinesStock() {
  const q = (els.searchMachines.value || "").trim().toLowerCase();
  const rows = state.machinesStock
    .filter(m => !q || (m.name||"").toLowerCase().includes(q) || (m.code||"").toLowerCase().includes(q))
    .sort((a,b)=>(a.name||"").localeCompare(b.name||"","pl"));

  els.machinesStockBody.innerHTML = rows.map(m => `
    <tr>
      <td>${escapeHtml(m.name)}</td>
      <td><span class="badge">${escapeHtml(m.code)}</span></td>
      <td class="right">${Number(m.qty || 0)}</td>
    </tr>
  `).join("");
}

// ====== Suwaki progów ======
function syncThresholdUI() {
  if (!els.warnRange || !els.dangerRange || !els.warnValue || !els.dangerValue) return;
  els.warnRange.value = String(LOW_WARN);
  els.dangerRange.value = String(LOW_DANGER);
  els.warnValue.textContent = String(LOW_WARN);
  els.dangerValue.textContent = String(LOW_DANGER);
}

function bindThresholds() {
  if (!els.warnRange || !els.dangerRange) return;

  LOW_WARN = Number(els.warnRange.value || 100);
  LOW_DANGER = Number(els.dangerRange.value || 50);
  if (LOW_DANGER >= LOW_WARN) LOW_DANGER = Math.max(0, LOW_WARN - 10);
  syncThresholdUI();

  const clamp = () => {
    if (LOW_DANGER >= LOW_WARN) LOW_DANGER = Math.max(0, LOW_WARN - 10);
    syncThresholdUI();
    renderSkuSummary();
  };

  els.warnRange.addEventListener("input", () => { LOW_WARN = Number(els.warnRange.value); clamp(); });
  els.dangerRange.addEventListener("input", () => { LOW_DANGER = Number(els.dangerRange.value); clamp(); });
}

// ====== Demo dane ======
function seedDemoData() {
  // katalog części
  upsertPart("BRG-6204", "Łożysko 6204");
  upsertPart("SCR-M6-30", "Śruba M6x30");
  upsertPart("SEN-IR01", "Czujnik IR");
  upsertPart("BLT-A32", "Pasek A32");
  upsertPart("PLT-3MM", "Blacha 3mm");
  upsertPart("ROD-10", "Pręt 10mm");
  upsertPart("PSU-12V5A", "Zasilacz 12V 5A");

  // dostawcy + cenniki
  ensureSupplier("ABC-Tools");
  setSupplierPrice("ABC-Tools", "BRG-6204", 12.50);
  setSupplierPrice("ABC-Tools", "SCR-M6-30", 0.35);
  setSupplierPrice("ABC-Tools", "BLT-A32", 19.90);

  ensureSupplier("Elektronix");
  setSupplierPrice("Elektronix", "SEN-IR01", 14.99);
  setSupplierPrice("Elektronix", "PSU-12V5A", 39.00);

  ensureSupplier("Metal-Pol");
  setSupplierPrice("Metal-Pol", "PLT-3MM", 180.00);
  setSupplierPrice("Metal-Pol", "ROD-10", 25.00);

  // partie magazynu
  addLot({ name: getPartName("BRG-6204"), sku: "BRG-6204", supplier: "ABC-Tools", qty: 10, unitPrice: 12.50 });
  addLot({ name: getPartName("BRG-6204"), sku: "BRG-6204", supplier: "ABC-Tools", qty: 10, unitPrice: 15.00 });
  addLot({ name: getPartName("SCR-M6-30"), sku: "SCR-M6-30", supplier: "ABC-Tools", qty: 400, unitPrice: 0.35 });
  addLot({ name: getPartName("SEN-IR01"), sku: "SEN-IR01", supplier: "Elektronix", qty: 10, unitPrice: 14.99 });
  addLot({ name: getPartName("BLT-A32"), sku: "BLT-A32", supplier: "ABC-Tools", qty: 10, unitPrice: 19.90 });

  renderPartsCatalogTable();
  renderSupplierSelects();

  renderSkuSummary();
  renderLotsTable();
  renderWarehouseTotal();
  renderMachinesStock();

  alert("Wgrano demo dane + katalog + dostawcy.");
}

// ====== Init + eventy ======


function init() {
  const today = new Date().toISOString().slice(0, 10);
  if (els.deliveryDate) els.deliveryDate.value = today;
  if (els.buildDate) els.buildDate.value = today;

  bindThresholds();
  renderMachineSelect();

  renderPartsCatalogTable();
  renderSupplierSelects();

  renderDeliveryItems();
  renderBuildItems();
  renderSkuSummary();
  renderLotsTable();
  renderWarehouseTotal();
  renderMachinesStock();

  renderMachineManageSelect();
renderBomSkuSelect();
renderBomTable();


  // startowe UI manual
  if (els.consumeMode && els.consumeMode.value === "manual") refreshManualConsumeUI();
}
init();

// ===== Eventy ogólne =====
els.addMachineBtn?.addEventListener("click", () => {
  const code = els.machineCodeInput.value;
  const name = els.machineNameInput.value;

  const res = addMachine(code, name);
  if (!res.ok) return alert(res.msg);

  els.machineCodeInput.value = "";
  els.machineNameInput.value = "";

  renderMachineManageSelect();
  renderBomTable();
  alert(res.msg);
});

els.machineManageSelect?.addEventListener("change", () => {
  renderBomTable();
});

els.addBomItemBtn?.addEventListener("click", () => {
  const m = getManagedMachine();
  if (!m) return alert("Wybierz maszynę do edycji.");

  const sku = els.bomSkuSelect.value;
  const qty = els.bomQtyInput.value;

  const res = addBomItem(m.code, sku, qty);
  if (!res.ok) return alert(res.msg);

  renderBomTable();
  alert(res.msg);
});

els.bomBody?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-del-bom]");
  if (!btn) return;

  const idx = Number(btn.dataset.delBom);
  const m = getManagedMachine();
  if (!m) return;

  m.bom.splice(idx, 1);
  renderBomTable();
});

els.searchParts?.addEventListener("input", () => {
  renderSkuSummary();
  renderLotsTable();
});

els.seedDemoBtn?.addEventListener("click", seedDemoData);

// ===== Dostawy =====
els.supplierSelect?.addEventListener("change", () => {
  renderSupplierPartsForDelivery();
  renderDeliveryItems();
});

els.supplierPartsSelect?.addEventListener("change", onDeliveryPartChange);
els.addDeliveryItemBtn?.addEventListener("click", addDeliveryItem);

els.deliveryItemsBody?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-remove]");
  if (!btn) return;
  const id = Number(btn.dataset.remove);
  state.currentDelivery.items = state.currentDelivery.items.filter(it => it.id !== id);
  renderDeliveryItems();
});

els.finalizeDeliveryBtn?.addEventListener("click", finalizeDelivery);

// ===== Produkcja =====
els.addBuildItemBtn?.addEventListener("click", addBuildItem);

els.buildItemsBody?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-remove-build]");
  if (!btn) return;
  const id = Number(btn.dataset.removeBuild);
  state.currentBuild.items = state.currentBuild.items.filter(it => it.id !== id);
  renderBuildItems();
  manualPlanGenerated = false;
  refreshManualConsumeUI();
});

els.finalizeBuildBtn?.addEventListener("click", finalizeBuild);

els.consumeMode?.addEventListener("change", () => {
  const isManual = (els.consumeMode.value === "manual");
  els.manualConsumeUI.innerHTML = "";
  els.manualConsumeBox.hidden = !isManual;
  manualPlanGenerated = false;
  if (isManual) refreshManualConsumeUI();
});

els.searchMachines?.addEventListener("input", renderMachinesStock);

// ===== Katalog części =====
els.addPartBtn?.addEventListener("click", () => {
  const sku = els.partSkuInput.value;
  const name = els.partNameInput.value;

  const res = upsertPart(sku, name);
  if (!res.ok) return alert(res.msg);

  els.partSkuInput.value = "";
  els.partNameInput.value = "";

  renderPartsCatalogTable();
  renderSupplierSkuDropdown();
  renderSupplierPartsForDelivery();
  alert(res.msg);
  renderBomSkuSelect();

});

// ===== Dostawcy + cenniki =====
els.addSupplierBtn?.addEventListener("click", () => {
  const name = String(els.supplierNameInput.value || "").trim();
  if (!name) return alert("Podaj nazwę dostawcy.");
  ensureSupplier(name);
  els.supplierNameInput.value = "";
  renderSupplierSelects();
  alert("Dodano dostawcę.");
});

els.supplierManageSelect?.addEventListener("change", () => {
  renderSupplierPriceTable();
});

els.setSupplierPriceBtn?.addEventListener("click", () => {
  const sup = currentManagedSupplier();
  if (!sup) return alert("Wybierz dostawcę do edycji (albo dodaj nowego).");

  const sku = els.supplierSkuSelect.value;
  const price = Number(els.supplierPriceInput.value || 0);

  const res = setSupplierPrice(sup, sku, price);
  if (!res.ok) return alert(res.msg);

  renderSupplierPriceTable();
  renderSupplierPartsForDelivery();
  alert(res.msg);
});
