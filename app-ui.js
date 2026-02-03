// === UI: renderery i komponenty ===

const els = {
    partsTable: document.querySelector("#partsTable tbody"),
    summaryTable: document.querySelector("#skuSummaryTable tbody"),
    whTotal: document.getElementById("warehouseTotal"),
    deliveryItems: document.querySelector("#deliveryItemsTable tbody"),
    buildItems: document.querySelector("#buildItemsTable tbody"),
    missingBox: document.getElementById("missingBox"),
    manualBox: document.getElementById("manualConsumeBox"),
    partsCatalog: document.querySelector("#partsCatalogTable tbody"),
    suppliersList: document.querySelector("#suppliersListTable tbody"),
    machinesCatalog: document.querySelector("#machinesCatalogTable tbody"),
    machineSelect: document.getElementById('machineSelect'),
    sideMissingList: document.getElementById('sideMissingList'),
    sideRecentActions: document.getElementById('sideRecentActions'),
};

function computePartsSummary() {
    const summary = new Map();
    (state.lots || []).forEach(lot => {
        const key = skuKey(lot.sku);
        const prev = summary.get(key) || { sku: lot.sku, name: lot.name, qty: 0, value: 0 };
        prev.qty += safeInt(lot.qty);
        prev.value += safeInt(lot.qty) * safeFloat(lot.unitPrice || 0);
        // keep latest friendly name if any
        prev.name = lot.name || prev.name;
        summary.set(key, prev);
    });
    return Array.from(summary.values());
}

function renderSideMissingTop5() {
    if (!els.sideMissingList) return;

    const rows = computePartsSummary()
        .filter(r => Number.isFinite(r.qty))
        // "braki" = najniższe stany, ale sensownie: tylko te poniżej progu ostrzeżenia
        .filter(r => r.qty <= LOW_WARN)
        .sort((a, b) => (a.qty - b.qty) || String(a.sku).localeCompare(String(b.sku), 'pl'))
        .slice(0, 5);

    if (!rows.length) {
        els.sideMissingList.innerHTML = '<li class="muted small" style="border:none; background:transparent; padding:0">Brak braków (wg progu ostrzeżenia).</li>';
        return;
    }

    els.sideMissingList.innerHTML = rows.map(r => {
        return `
            <li>
                <div class="sideItemMain">
                    <div class="sideItemTop">
                        <span class="badge">${r.sku}</span>
                        <span>${r.name || "—"}</span>
                    </div>
                    <div class="sideItemMeta">Stan ≤ ${LOW_WARN} (ostrzeżenie)</div>
                </div>
                <div class="sideQty">${r.qty}</div>
            </li>
        `;
    }).join('');
}

function renderSideRecentActions5() {
    if (!els.sideRecentActions) return;

    const rows = (state.history || [])
        .slice()
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, 5);

    if (!rows.length) {
        els.sideRecentActions.innerHTML = '<li class="muted small" style="border:none; background:transparent; padding:0">Brak akcji.</li>';
        return;
    }

    els.sideRecentActions.innerHTML = rows.map(ev => {
        const typeLabel = ev.type === "delivery" ? "Dostawa" : "Produkcja";
        const meta = ev.type === "delivery"
            ? `${(ev.items || []).length} poz. • ${ev.supplier ? ev.supplier : "—"}`
            : `${(ev.items || []).length} poz.`;

        return `
            <li>
                <div class="sideItemMain">
                    <div class="sideItemTop">
                        <span class="historyPill ${ev.type === "delivery" ? "delivery" : "build"}">${typeLabel}</span>
                        <span>${fmtDateISO(ev.dateISO)}</span>
                    </div>
                    <div class="sideItemMeta">${meta}</div>
                </div>
            </li>
        `;
    }).join('');
}

function renderSidePanel() {
    // update both lists in one go (cheap, small state)
    renderSideMissingTop5();
    renderSideRecentActions5();
}

function renderWarehouse() {
    if (!els.partsTable || !els.summaryTable || !els.whTotal) return;
    const q = normalize(document.getElementById("searchParts")?.value).toLowerCase();
    const summary = new Map();
    const qtyByKey = new Map();
    let grandTotal = 0;

    // POPRAWKA: Wyszukiwanie obejmuje dostawcę
    const filteredLots = state.lots.filter(l =>
        !q ||
        l.sku.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        (l.supplier || "").toLowerCase().includes(q)
    );

    // sort: ilość rosnąco (display-only)
    const filteredLotsSorted = filteredLots
        .slice()
        .sort((a, b) => (safeInt(a.qty) - safeInt(b.qty)) || ((a.id || 0) - (b.id || 0)));

    filteredLotsSorted.forEach(lot => {
        const key = skuKey(lot.sku);
        summary.set(key, summary.get(key) || { sku: lot.sku, name: lot.name, qty: 0, value: 0 });
        summary.get(key).qty += lot.qty;
        summary.get(key).value += lot.qty * (lot.unitPrice || 0);
    });

    // Mapka ilości do progów (żeby w widoku partii też działało ostrzeganie)
    summary.forEach((item, key) => {
        qtyByKey.set(key, item.qty);
    });

    els.partsTable.innerHTML = filteredLotsSorted.map(lot => {
        const key = skuKey(lot.sku);
        const totalQty = qtyByKey.get(key) ?? lot.qty;
        const rowClass = totalQty <= LOW_DANGER ? "stock-danger" : totalQty <= LOW_WARN ? "stock-warn" : "";
        return `
        <tr class="${rowClass}">
            <td><span class="badge">${lot.sku}</span> ${lot.name}</td>
            <td>${lot.supplier || "-"}</td>
            <td class="right">${fmtPLN.format(lot.unitPrice || 0)}</td>
            <td class="right">${lot.qty}</td>
            <td class="right">${fmtPLN.format(lot.qty * (lot.unitPrice || 0))}</td>
        </tr>
    `;
    }).join("");

    summary.forEach(item => {
        grandTotal += item.value;
    });

    els.summaryTable.innerHTML = Array.from(summary.values())
        .slice()
        .sort((a, b) => (safeInt(a.qty) - safeInt(b.qty)) || String(a.sku).localeCompare(String(b.sku), 'pl'))
        .map(item => `
        <tr class="${ item.qty <= LOW_DANGER ? "stock-danger" : item.qty <= LOW_WARN ? "stock-warn" : "" }">
            <td><span class="badge">${item.sku}</span></td>
            <td>${item.name}</td>
            <td class="right">${item.qty}</td>
            <td class="right">${fmtPLN.format(item.value)}</td>
        </tr>
    `).join("");

    els.whTotal.textContent = fmtPLN.format(grandTotal);

    // panel: braki + ostatnie akcje
    renderSidePanel();
}

function renderDelivery() {
    if (!els.deliveryItems) return;
    const items = state.currentDelivery.items;
    let total = 0;
    els.deliveryItems.innerHTML = items.map(i => {
        const rowVal = i.qty * i.price;
        total += rowVal;
        return `<tr>
            <td><span class="badge">${i.sku}</span> ${i.name}</td>
            <td class="right">${i.qty}</td>
            <td class="right">${fmtPLN.format(i.price)}</td>
            <td class="right">${fmtPLN.format(rowVal)}</td>
            <td class="right"><button class="iconBtn" onclick="removeDeliveryItem(${i.id})">✕</button></td>
        </tr>`;
    }).join("");
    
    const itemsCountEl = document.getElementById("itemsCount");
    const itemsTotalEl = document.getElementById("itemsTotal");
    const finalizeBtn = document.getElementById("finalizeDeliveryBtn");
    if (itemsCountEl) itemsCountEl.textContent = String(items.length);
    if (itemsTotalEl) itemsTotalEl.textContent = fmtPLN.format(total);
    if (finalizeBtn) finalizeBtn.disabled = items.length === 0;
}

function renderBuild() {
    if (!els.buildItems) return;
    els.buildItems.innerHTML = state.currentBuild.items.map(i => {
        const m = state.machineCatalog.find(x => x.code === i.machineCode);
        return `<tr>
            <td>${m ? m.name : "???"} <span class="badge">${i.machineCode}</span></td>
            <td class="right">${i.qty}</td>
            <td class="right"><button class="iconBtn" onclick="removeBuildItem(${i.id})">✕</button></td>
        </tr>`;
    }).join("");
    
    const buildCountEl = document.getElementById("buildItemsCount");
    const finalizeBuildBtn = document.getElementById("finalizeBuildBtn");
    if (buildCountEl) buildCountEl.textContent = String(state.currentBuild.items.length);
    if (finalizeBuildBtn) finalizeBuildBtn.disabled = state.currentBuild.items.length === 0;
    els.missingBox.hidden = true;
    els.manualBox.hidden = true;
}

function renderMissingParts(missing) {
    if (!els.missingBox) return;
    els.missingBox.hidden = false;
    const list = byId("missingList");
    if (!list) return;
    list.innerHTML = missing.map(m =>
        `<li><strong>${m.sku}</strong>: Potrzeba ${m.needed}, stan: ${m.has} (brak: ${m.needed - m.has})</li>`
    ).join("");
}

function renderManualConsume() {
    const req = calculateBuildRequirements();
    const container = document.getElementById("manualConsumeUI");
    if (!container) return;
    container.innerHTML = "";
    
    const missing = checkStockAvailability(req);
    if (missing.length > 0) {
        renderMissingParts(missing);
        els.manualBox.hidden = true;
        return;
    }

    els.manualBox.hidden = false;
    
    req.forEach((qtyNeeded, skuKeyStr) => {
        const part = state.partsCatalog.get(skuKeyStr);
        const lots = state.lots.filter(l => skuKey(l.sku) === skuKeyStr);
        
        const html = `
        <div class="consumePart">
            <div style="margin-bottom:6px">
                <strong>${part?.sku || skuKeyStr}</strong> 
                <span class="muted">(Wymagane: ${qtyNeeded})</span>
            </div>
            ${lots.map(lot => `
                <div class="lotRow">
                    <span>${lot.supplier} (${fmtPLN.format(lot.unitPrice)}) - Dostępne: ${lot.qty}</span>
                    <input type="number" class="manual-lot-input"
                        data-lot-id="${lot.id}" 
                        data-sku="${skuKeyStr}"
                        max="${lot.qty}" min="0" value="0">
                </div>
            `).join("")}
        </div>`;
        container.insertAdjacentHTML('beforeend', html);
    });
}

function renderMachinesStock() {
    const q = normalize(document.getElementById("searchMachines")?.value).toLowerCase();
    const tbody = document.querySelector("#machinesStockTable tbody");
    if (!tbody) return;

    tbody.innerHTML = state.machinesStock
        .filter(m => !q || m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q))
        .map(m => `<tr>
            <td><span class="badge">${m.code}</span></td>
            <td>${m.name}</td>
            <td class="right"><strong>${m.qty}</strong></td>
        </tr>`).join("");
}


function renderHistory() {
    const tbody = document.querySelector("#historyTable tbody");
    if (!tbody) return;

    const rows = (state.history || [])
        .slice()
        .sort((a,b) => (b.ts || 0) - (a.ts || 0));

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="muted small">Brak zapisanych akcji. Zatwierdź dostawę albo finalizuj produkcję, a pojawią się tutaj.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(ev => {
        const typeLabel = ev.type === "delivery" ? "Dostawa" : "Produkcja";
        const pillClass = ev.type === "delivery" ? "delivery" : "build";
        return `
        <tr data-hid="${ev.id}">
            <td><span class="historyPill ${pillClass}">${typeLabel}</span></td>
            <td>${fmtDateISO(ev.dateISO)}</td>
            <td class="right">
                <button class="secondary compact historyPreviewBtn" type="button" data-action="toggleHistory" data-hid="${ev.id}">Podgląd</button>
            </td>
        </tr>
        <tr class="historyDetailRow" data-hid-detail="${ev.id}" hidden>
            <td colspan="3">
                <div class="historyDetails"></div>
            </td>
        </tr>`;
    }).join("");

    // panel: ostatnie akcje
    renderSideRecentActions5();
}

function buildHistoryDetails(ev) {
    if (!ev) return "";
    const typeLabel = ev.type === "delivery" ? "Dostawa" : "Produkcja";
    const metaBits = [];

    if (ev.type === "delivery") {
        if (ev.supplier) metaBits.push(`<span class="badge">${ev.supplier}</span>`);
        metaBits.push(`<span class="muted small">Pozycji: <strong>${(ev.items||[]).length}</strong></span>`);
        const total = (ev.items||[]).reduce((s,i)=>s + (safeFloat(i.price) * safeInt(i.qty)), 0);
        metaBits.push(`<span class="muted small">Suma: <strong class="historyMoney">${fmtPLN.format(total)}</strong></span>`);
        return `
            <div class="historyGrid">
                <div class="historyMeta">
                    <strong>${typeLabel}</strong>
                    <span class="muted small">•</span>
                    <span class="muted small">${fmtDateISO(ev.dateISO)}</span>
                    ${metaBits.join("")}
                </div>
                <div class="uiSection" style="margin:0">
                    <div class="uiSectionHead">
                        <div class="small muted">Szczegóły dostawy</div>
                    </div>
                    <div class="tableWrap" style="margin:0">
                        <table class="tightTable" style="min-width:auto">
                            <thead>
                                <tr>
                                    <th>Nazwa (ID)</th>
                                    <th class="right">Ilość</th>
                                    <th class="right">Cena</th>
                                    <th class="right">Razem</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(ev.items||[]).map(i => {
                                    const rowVal = safeInt(i.qty) * safeFloat(i.price);
                                    return `<tr>
                                        <td><span class="badge">${i.sku}</span> ${i.name || ""}</td>
                                        <td class="right">${safeInt(i.qty)}</td>
                                        <td class="right">${fmtPLN.format(safeFloat(i.price))}</td>
                                        <td class="right">${fmtPLN.format(rowVal)}</td>
                                    </tr>`;
                                }).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    // build
    metaBits.push(`<span class="muted small">Pozycji: <strong>${(ev.items||[]).length}</strong></span>`);
    const totalQty = (ev.items||[]).reduce((s,i)=>s + safeInt(i.qty), 0);
    metaBits.push(`<span class="muted small">Sztuk: <strong>${totalQty}</strong></span>`);

    return `
        <div class="historyGrid">
            <div class="historyMeta">
                <strong>${typeLabel}</strong>
                <span class="muted small">•</span>
                <span class="muted small">${fmtDateISO(ev.dateISO)}</span>
                ${metaBits.join("")}
            </div>

            <div class="uiSection" style="margin:0">
                <div class="uiSectionHead">
                    <div class="small muted">Zbudowane maszyny</div>
                </div>
                <div class="tableWrap" style="margin:0">
                    <table class="tightTable" style="min-width:auto">
                        <thead>
                            <tr>
                                <th>Maszyna</th>
                                <th class="right">Ilość</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(ev.items||[]).map(i => {
                                return `<tr>
                                    <td>${i.name || "—"} <span class="badge">${i.code}</span></td>
                                    <td class="right">${safeInt(i.qty)}</td>
                                </tr>`;
                            }).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function addHistoryEvent(ev) {
    if (!state.history) state.history = [];
    state.history.push(ev);
    // limit to last 200 entries to keep localStorage sane
    if (state.history.length > 200) state.history = state.history.slice(-200);
    save();
}

function renderAllSuppliers() {
    const table = byId("suppliersListTable");
    const tbody = table ? table.querySelector("tbody") : null;
    if (!tbody) return;
    tbody.innerHTML = Array.from(state.suppliers.keys()).sort().map(name => `
        <tr>
            <td>${name}</td>
            <td class="right">
                <button class="success compact" onclick="openSupplierEditor('${name}')">Cennik</button>
                <button class="iconBtn" onclick="askDeleteSupplier('${name}')">Usuń</button>
            </td>
        </tr>
    `).join("");
    
    renderSelectOptions(document.getElementById("supplierSelect"), Array.from(state.suppliers.keys()));
}

function refreshCatalogsUI() {
    // Defensive: if a tab panel is removed/renamed in HTML, don't crash.
    if (!els.partsCatalog || !els.machinesCatalog) return;

    // 1. PARTS CATALOG TABLE
    const parts = Array.from(state.partsCatalog.values());
    els.partsCatalog.innerHTML = parts.map(p => {
        // Find suppliers who have this part
        const suppliers = Array.from(state.suppliers.entries())
            .filter(([_, data]) => data.prices.has(skuKey(p.sku)))
            .map(([n]) => n);
            
        return `<tr>
            <td><span class="badge">${p.sku}</span></td>
            <td>${p.name}</td>
            <td>${suppliers.length ? suppliers.map(s => `<span class="supplierChip small">${s}</span>`).join(" ") : '<span class="muted">-</span>'}</td>
            <td class="right">
                <button class="success compact" onclick="startEditPart('${p.sku}')">Edytuj</button>
                <button class="iconBtn" onclick="askDeletePart('${p.sku}')">Usuń</button>
            </td>
        </tr>`;
    }).join("");

    // 2. MACHINES CATALOG
    els.machinesCatalog.innerHTML = state.machineCatalog.map(m => `
        <tr>
            <td><span class="badge">${m.code}</span></td>
            <td>${m.name}</td>
            <td class="right">${m.bom.length}</td>
            <td class="right">
                <button class="success compact" onclick="openMachineEditor('${m.code}')">Edytuj BOM</button>
                <button class="iconBtn" onclick="askDeleteMachine('${m.code}')">Usuń</button>
            </td>
        </tr>
    `).join("");

    // 3. SELECTS for machines
    renderSelectOptions(els.machineSelect, state.machineCatalog.map(m => m.code), c => {
        const m = state.machineCatalog.find(x => x.code === c);
        return `${m.name} (${c})`;
    });

    // 4. GENERATE SUPPLIER CHECKBOXES FOR NEW PART
    const supCheckList = byId("partNewSuppliersChecklist");
    const allSups = Array.from(state.suppliers.keys()).sort();
    if (!supCheckList) return;
    
    if (allSups.length === 0) {
        supCheckList.innerHTML = '<span class="small muted">Brak zdefiniowanych dostawców. Dodaj ich w zakładce "Dostawcy".</span>';
    } else {
        supCheckList.innerHTML = allSups.map(s => `
            <label style="display:inline-flex; align-items:center; background:rgba(255,255,255,0.05); padding:4px 8px; border-radius:12px; font-size:0.85rem; cursor:pointer;">
                <input type="checkbox" name="newPartSupplier" value="${s}" style="width:auto; margin:0 6px 0 0;">
                ${s}
            </label>
        `).join("");
    }
}

// === UTILS UI ===
function renderSelectOptions(select, values, displayMapFn = x => x) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">-- Wybierz --</option>' + 
        values.map(v => `<option value="${v}">${displayMapFn(v)}</option>`).join("");
    if (values.includes(current)) select.value = current;
}

function toast(title, msg, type="ok") {
    // Defensive: ensure host exists (toast can be called before init() in edge-cases)
    let host = document.querySelector(".toastHost");
    if (!host) {
        host = document.createElement("div");
        host.className = "toastHost";
        document.body.appendChild(host);
    }

    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `<div style="font-weight:bold">${title}</div><div>${msg}</div>`;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3000);
}
