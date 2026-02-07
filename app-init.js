// === INIT & BINDINGS ===
const WAREHOUSE_VIEW_KEY = "magazyn_parts_view";

// Strict integer parser for quantities (rejects 1e3, spaces, commas, decimals)
function strictParseQtyInt(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    // accept only ASCII digits
    if (!/^\d+$/.test(s)) return null;
    const n = parseInt(s, 10);
    if (!Number.isFinite(n) || n < 1) return null;
    return n;
}

function setWarehouseView(view) {
    const v = (view === "batches") ? "batches" : "compact";
    const split = document.getElementById("partsSplit");
    if (split) split.setAttribute("data-view", v);

    const bCompact = document.getElementById("partsViewCompactBtn");
    const bBatches = document.getElementById("partsViewBatchesBtn");

    if (bCompact) {
        bCompact.classList.toggle("active", v === "compact");
        bCompact.setAttribute("aria-selected", v === "compact" ? "true" : "false");
    }
    if (bBatches) {
        bBatches.classList.toggle("active", v === "batches");
        bBatches.setAttribute("aria-selected", v === "batches" ? "true" : "false");
    }

    localStorage.setItem(WAREHOUSE_VIEW_KEY, v);

    renderWarehouse();
}

function initWarehouseViewToggle() {
    const bCompact = document.getElementById("partsViewCompactBtn");
    const bBatches = document.getElementById("partsViewBatchesBtn");
    const split = document.getElementById("partsSplit");
    if (!split || (!bCompact && !bBatches)) return;

    const saved = localStorage.getItem(WAREHOUSE_VIEW_KEY);
    setWarehouseView(saved === "batches" ? "batches" : "compact");

    bCompact?.addEventListener("click", () => setWarehouseView("compact"));
    bBatches?.addEventListener("click", () => setWarehouseView("batches"));
}



// === History view + filters ===
const HISTORY_VIEW_KEY = "magazyn_history_view";

function setHistoryView(view) {
    const v = (view === "builds") ? "builds" : "deliveries";

    const bDel = document.getElementById("historyViewDeliveriesBtn");
    const bBuild = document.getElementById("historyViewBuildsBtn");

    if (bDel) {
        bDel.classList.toggle("active", v === "deliveries");
        bDel.setAttribute("aria-selected", v === "deliveries" ? "true" : "false");
    }
    if (bBuild) {
        bBuild.classList.toggle("active", v === "builds");
        bBuild.setAttribute("aria-selected", v === "builds" ? "true" : "false");
    }

    const search = document.getElementById("historySearch");
    if (search) {
        search.placeholder = (v === "deliveries")
            ? "Szukaj po Dostawcy lub Nazwie/Typie części..."
            : "Szukaj po Nazwie/Typie maszyny...";
    }

    localStorage.setItem(HISTORY_VIEW_KEY, v);

    // Close any open detail rows (switching context)
    document.querySelectorAll("tr.historyDetailRow").forEach(r => { r.hidden = true; });
    document.querySelectorAll('[data-action="toggleHistory"]').forEach(b => {
        b.textContent = "Podgląd";
        b.classList.remove("primary");
        b.classList.add("secondary");
    });

    renderHistory();
}

function initHistoryViewToggle() {
    const bDel = document.getElementById("historyViewDeliveriesBtn");
    const bBuild = document.getElementById("historyViewBuildsBtn");
    if (!bDel || !bBuild) return;

    const saved = localStorage.getItem(HISTORY_VIEW_KEY);
    setHistoryView(saved === "builds" ? "builds" : "deliveries");

    bDel.addEventListener("click", () => setHistoryView("deliveries"));
    bBuild.addEventListener("click", () => setHistoryView("builds"));
}

function initHistoryFilters() {
    const search = document.getElementById("historySearch");
    const date = document.getElementById("historyDateRange");
    if (search) search.addEventListener("input", () => renderHistory());
    if (date) date.addEventListener("input", () => renderHistory());
}


function initSidePanelSignals() {
    // Click-through from side panel (signals) to main parts view
    if (window.__sidePanelSignalsBound) return;
    window.__sidePanelSignalsBound = true;

    document.addEventListener("click", (e) => {
        const row = e.target && e.target.closest ? e.target.closest(".sideSignalRow") : null;
        if (!row) return;

        const sku = row.getAttribute("data-sku");
        if (!sku) return;

        // Switch to parts tab
        const partsTabBtn = document.querySelector('.tabBtn[data-tab-target="parts"]');
        if (partsTabBtn) partsTabBtn.click();

        // Prefer compact view for SKU focus
        setWarehouseView("compact");

        // Apply search filter
        const search = document.getElementById("searchParts");
        if (search) {
            search.value = sku;
            search.dispatchEvent(new Event("input"));
            search.focus();
        }

        // Bring panel into view (avoid hunting)
        const partsPanel = document.querySelector('[data-tab-panel="parts"]');
        if (partsPanel && partsPanel.scrollIntoView) {
            partsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });
}



function initThresholdsToggle() {
    const panel = byId("thresholdsPanel");
    const btn = byId("toggleThresholdsBtn");
    if (!panel || !btn) return;

    // Default: collapsed. Persist only open/closed state (no schema impact).
    const saved = localStorage.getItem(THRESHOLDS_OPEN_KEY);
    const isOpen = saved === "1";

    panel.classList.toggle("collapsed", !isOpen);
    setExpanded(btn, isOpen);

    btn.addEventListener("click", () => {
        const nowOpen = panel.classList.contains("collapsed");
        panel.classList.toggle("collapsed", !nowOpen);
        localStorage.setItem(THRESHOLDS_OPEN_KEY, nowOpen ? "1" : "0");
        setExpanded(btn, nowOpen);
    });
}

function init() {
    initTheme();
    initThresholdsToggle();
    if (!document.querySelector(".toastHost")) {
        const h = document.createElement("div"); h.className = "toastHost"; document.body.appendChild(h);
    }
    load();
    bindTabs();
    bindSearch();
    initWarehouseViewToggle();
    initHistoryViewToggle();
    initHistoryFilters();
    initSidePanelSignals();

    // Historia: podgląd (delegacja zdarzeń)
    document.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-action="toggleHistory"]') : null;
        if (!btn) return;

        const id = btn.getAttribute("data-hid");
        const detailRow = document.querySelector(`[data-hid-detail="${id}"]`);
        if (!detailRow) return;

        const ev = (state.history || []).find(x => String(x.id) === String(id));
        if (!ev) return;

        const willOpen = detailRow.hidden;

        // zamknij wszystkie
        document.querySelectorAll("tr.historyDetailRow").forEach(r => { r.hidden = true; });
        document.querySelectorAll('[data-action="toggleHistory"]').forEach(b => {
            b.textContent = "Podgląd";
            b.classList.remove("primary");
            b.classList.add("secondary");
        });

        if (!willOpen) return;

        detailRow.hidden = false;
        const box = detailRow.querySelector(".historyDetails");
        if (box) box.innerHTML = buildHistoryDetails(ev);

        btn.textContent = "Zamknij";
        btn.classList.add("primary");
        btn.classList.remove("secondary");
        detailRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });


    // Toggle podglądu zużytych części per maszyna (wewnątrz historii produkcji)
    document.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('[data-action="toggleBuildMachine"]') : null;
        if (!btn) return;

        const bmid = btn.getAttribute("data-bmid");
        if (!bmid) return;

        const scope = btn.closest(".historyDetails") || document;
        const detailRow = scope.querySelector(`[data-bmid-detail="${bmid}"]`);
        if (!detailRow) return;

        const willOpen = detailRow.hidden;

        // Zamknij inne w tym samym podglądzie historii (żeby nie robić spaghetti w UI)
        scope.querySelectorAll("tr.buildMachineDetailRow").forEach(r => { r.hidden = true; });
        scope.querySelectorAll('[data-action="toggleBuildMachine"]').forEach(b => {
            b.textContent = "Podgląd";
            b.setAttribute("aria-expanded", "false");
        });

        if (!willOpen) return;

        detailRow.hidden = false;
        btn.textContent = "Zamknij";
        btn.setAttribute("aria-expanded", "true");
    });


    
    renderWarehouse();
    renderAllSuppliers();
    renderMachinesStock();
    refreshCatalogsUI();

    bindSupplierPricesUI();

    // Sync threshold UI with persisted values
    const warnRange = document.getElementById("warnRange");
    const dangerRange = document.getElementById("dangerRange");
    const warnValue = document.getElementById("warnValue");
    const dangerValue = document.getElementById("dangerValue");
    if (warnRange) warnRange.value = String(LOW_WARN);
    if (dangerRange) dangerRange.value = String(LOW_DANGER);
    if (warnValue) warnValue.textContent = String(LOW_WARN);
    if (dangerValue) dangerValue.textContent = String(LOW_DANGER);

    document.getElementById("warnRange")?.addEventListener("input", (e) => {
        const v = parseInt(e.target.value, 10);
        LOW_WARN = Number.isFinite(v) ? Math.max(0, v) : 0;

        // keep invariant: LOW_DANGER <= LOW_WARN
        if (LOW_DANGER > LOW_WARN) {
            LOW_DANGER = LOW_WARN;
            const dangerRange = document.getElementById("dangerRange");
            if (dangerRange) dangerRange.value = String(LOW_DANGER);
            const dangerValue = document.getElementById("dangerValue");
            if (dangerValue) dangerValue.textContent = String(LOW_DANGER);
        }

        const warnValue = document.getElementById("warnValue");
        if (warnValue) warnValue.textContent = String(LOW_WARN);
        save(); renderWarehouse();
    });
    document.getElementById("dangerRange")?.addEventListener("input", (e) => {
        const v = parseInt(e.target.value, 10);
        LOW_DANGER = Number.isFinite(v) ? Math.max(0, v) : 0;

        // keep invariant: LOW_DANGER <= LOW_WARN
        if (LOW_DANGER > LOW_WARN) {
            LOW_DANGER = LOW_WARN;
            const dangerRange = document.getElementById("dangerRange");
            if (dangerRange) dangerRange.value = String(LOW_DANGER);
        }

        const dangerValue = document.getElementById("dangerValue");
        if (dangerValue) dangerValue.textContent = String(LOW_DANGER);
        save(); renderWarehouse();
    });
    // Edycja części (Baza Części)
    document.getElementById("saveEditPartBtn")?.addEventListener("click", saveEditPart);
    document.getElementById("cancelEditPartBtn")?.addEventListener("click", cancelEditPart);

    // --- Searchable comboboxes (single-select) ---
    // Keep native <select> elements in DOM (existing logic listens to change events)
    try {
        initComboFromSelect(document.getElementById("supplierSelect"), { placeholder: "Wybierz dostawcę..." });
        initComboFromSelect(document.getElementById("supplierPartsSelect"), { placeholder: "Wybierz część..." });
        initComboFromSelect(document.getElementById("machineSelect"), { placeholder: "Wybierz maszynę..." });
        initComboFromSelect(document.getElementById("supplierEditorPartSelect"), { placeholder: "Wybierz część..." });
        initComboFromSelect(document.getElementById("bomSkuSelect"), { placeholder: "Wybierz część..." });

        // Delivery: part chooser should look normal but remain disabled until supplier is chosen
        const supSel = document.getElementById("supplierSelect");
        const partSel = document.getElementById("supplierPartsSelect");
        if (partSel) {
            partSel.disabled = !supSel?.value;
            refreshComboFromSelect(partSel, { placeholder: "Wybierz część..." });
        }
    } catch {}
}

 // EVENTS

// --- Delivery ---
document.getElementById("supplierSelect")?.addEventListener("change", (e) => {
  if (state.currentDelivery.items.length > 0 && state.currentDelivery.supplier && state.currentDelivery.supplier !== e.target.value) {
    if (!confirm("Zmiana dostawcy spowoduje usunięcie bieżących pozycji dostawy. Kontynuować?")) {
      e.target.value = state.currentDelivery.supplier || "";
      return;
    }
    state.currentDelivery.items = [];
    state.currentDelivery.supplier = e.target.value;
    renderDelivery();
  }
  const supName = e.target.value;
  const skuSelect = document.getElementById("supplierPartsSelect");
  if (skuSelect) skuSelect.disabled = !supName;

  if (!supName) {
    // Keep a consistent placeholder instead of an empty select
    skuSelect.innerHTML = '<option value="">-- Wybierz część --</option>';
    try { refreshComboFromSelect(skuSelect, { placeholder: "Wybierz część..." }); } catch {}
    return;
  }

  const sup = state.suppliers.get(supName);

  // FIX: jeśli dostawca nie ma jeszcze pozycji w cenniku, pokaż wszystkie części z katalogu
  // Dodatkowo: filtruj do części, które faktycznie istnieją w partsCatalog (żeby nie dało się wybrać "martwej" pozycji z cennika)
  const skuListRaw = (sup && sup.prices && sup.prices.size)
    ? Array.from(sup.prices.keys())
    : Array.from(state.partsCatalog.keys());

  const skuList = skuListRaw.filter(k => state.partsCatalog.has(k));
skuSelect.innerHTML =
    '<option value="">-- Wybierz część --</option>' +
    skuList.map(k => {
      const p = state.partsCatalog.get(k);
      const price = (sup && sup.prices) ? (sup.prices.get(k) ?? 0) : 0;
      return `<option value="${k}" data-price="${price}">
        ${p ? p.sku : k} - ${p ? p.name : ""} (${fmtPLN.format(price)})
      </option>`;
    }).join("");

  skuSelect.dispatchEvent(new Event("change"));
  try { refreshComboFromSelect(skuSelect, { placeholder: "Wybierz część..." }); } catch {}
});

document.getElementById("supplierPartsSelect")?.addEventListener("change", (e) => {
  const opt = e.target.selectedOptions[0];

  // FIX: placeholder/brak wyboru nie powinien wpychać undefined/NaN
  if (!opt || !opt.value) {
    document.getElementById("deliveryPrice").value = 0;
    return;
  }

  document.getElementById("deliveryPrice").value = opt.dataset.price ?? 0;
});

document.getElementById("addDeliveryItemBtn")?.addEventListener("click", () => {
    const btn = document.getElementById("addDeliveryItemBtn");
    if (btn?.dataset.busy === "1") return; // simple anti-double-click

    const sup = document.getElementById("supplierSelect").value;
    if (!sup) return toast("Błąd", "Wybierz dostawcę.", "warn");
    
    const skuKeyVal = document.getElementById("supplierPartsSelect").value;
    if (!skuKeyVal) return toast("Błąd", "Wybierz część.", "warn");
    
    const qtyEl = document.getElementById("deliveryQty");
    const priceEl = document.getElementById("deliveryPrice");

    const qtyRaw = qtyEl ? qtyEl.value : "";
    const priceRaw = priceEl ? priceEl.value : "";

    const qtyNum = strictParseQtyInt(qtyRaw);
    if (qtyNum === null) {
        toast("Błąd", "Ilość musi być liczbą całkowitą ≥ 1 (bez spacji i bez notacji typu 1e3).", "warn");
        qtyEl?.focus();
        return;
    }

    const priceNum = safeFloat(priceRaw);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
        toast("Błąd", "Cena nie może być ujemna.", "warn");
        priceEl?.focus();
        return;
    }
    
    const part = state.partsCatalog.get(skuKeyVal);
    if (!part) {
        toast("Błąd", "Wybrana część nie istnieje w bazie (stary wpis w cenniku dostawcy). Odśwież listę lub usuń tę pozycję z cennika.", "bad");
        return;
    }

    // Busy guard: very small, keeps behavior, avoids accidental duplicates on double click.
    // Ważne: reset w finally, żeby busy nie utknęło na "1" po wyjątku.
    if (btn) btn.dataset.busy = "1";
    try {
        addToDelivery(sup, part.sku, qtyNum, priceNum);
    } finally {
        setTimeout(() => { if (btn) btn.dataset.busy = "0"; }, 250);
    }
});

document.getElementById("finalizeDeliveryBtn")?.addEventListener("click", () => {
    try { finalizeDelivery(); }
    catch (e) { console.error(e); toast("Błąd", "Nie udało się zatwierdzić dostawy (szczegóły w konsoli).", "bad"); }
});
window.removeDeliveryItem = (id) => {
    state.currentDelivery.items = state.currentDelivery.items.filter(x => x.id !== id);
    save(); renderDelivery();
}

// --- Build ---
document.getElementById("addBuildItemBtn")?.addEventListener("click", () => {
    const btn = document.getElementById("addBuildItemBtn");
    if (btn?.dataset.busy === "1") return;

    const code = els.machineSelect.value;
    if (!code) {
        toast("Błąd", "Wybierz maszynę.", "warn");
        return;
    }

    const qtyEl = document.getElementById("buildQty");
    const qtyRaw = qtyEl ? qtyEl.value : "";
    const qtyNum = strictParseQtyInt(qtyRaw);
    if (qtyNum === null) {
        toast("Błąd", "Ilość sztuk musi być liczbą całkowitą ≥ 1 (bez spacji i bez notacji typu 1e3).", "warn");
        qtyEl?.focus();
        return;
    }

    if (btn) btn.dataset.busy = "1";
    
    state.currentBuild.items.push({ id: nextId(), machineCode: code, qty: qtyNum });
    save(); renderBuild();

    setTimeout(() => { if (btn) btn.dataset.busy = "0"; }, 250);
});

window.removeBuildItem = (id) => {
    state.currentBuild.items = state.currentBuild.items.filter(x => x.id !== id);
    save(); renderBuild();
}

document.getElementById("finalizeBuildBtn")?.addEventListener("click", () => {
    try {
            const mode = document.getElementById("consumeMode").value;
            if (mode === 'manual') {
                const inputs = document.querySelectorAll(".manual-lot-input");
                const manualAlloc = {};
                let error = false;
        
                const req = calculateBuildRequirements();
                const currentSum = new Map();
        
                inputs.forEach(inp => {
                    const val = safeQtyInt(inp.value);
                    if (val > 0) {
                        manualAlloc[inp.dataset.lotId] = val;
                        const k = inp.dataset.sku;
                        currentSum.set(k, (currentSum.get(k)||0) + val);
                    }
                });

                req.forEach((needed, k) => {
                    if ((currentSum.get(k) || 0) !== needed) {
                        toast("Błąd manualny", `Dla części ${state.partsCatalog.get(k)?.sku} wybrano ${currentSum.get(k)||0}, a potrzeba ${needed}.`, "bad");
                        error = true;
                    }
                });

                if (!error) finalizeBuild(manualAlloc);
            } else {
                finalizeBuild(null);
            }
    } catch (e) {
        console.error(e);
        toast("Błąd", "Nie udało się finalizować produkcji (szczegóły w konsoli).", "bad");
    }
});

document.getElementById("consumeMode")?.addEventListener("change", (e) => {
    if (e.target.value === 'manual') renderManualConsume();
    else {
        els.manualBox.hidden = true;
        els.missingBox.hidden = true;
    }
});

// --- Catalogs ---
document.getElementById("addPartBtn")?.addEventListener("click", () => {
    const sku = document.getElementById("partSkuInput")?.value || "";
    const name = document.getElementById("partNameInput")?.value || "";

    // Pobierz zaznaczonych dostawców (multi-combobox)
    const box = document.getElementById("partNewSuppliersChecklist");
    const selectedSups = (typeof comboMultiGetSelected === "function") ? comboMultiGetSelected(box) : [];

    const res = upsertPart(sku, name, selectedSups);
    toast(res.success ? "OK" : "Błąd", res.msg, res.success ? "ok" : "warn");

    if (res.success) {
        // Zapisz ceny dla zaznaczonych dostawców (jeśli wpisane)
        const k = skuKey(sku);
        const panel = document.getElementById("newPartSupplierPrices");
        const inputs = panel ? panel.querySelectorAll('input[data-sup]') : [];
        inputs.forEach(inp => {
            const sup = inp.getAttribute("data-sup");
            if (!sup) return;
            updateSupplierPrice(sup, sku, inp.value);
        });

        // Reset pól
        const skuEl = document.getElementById("partSkuInput");
        const nameEl = document.getElementById("partNameInput");
        if (skuEl) skuEl.value = "";
        if (nameEl) nameEl.value = "";

        // Reset wyboru dostawców
        if (typeof comboMultiClear === "function") comboMultiClear(box);

        refreshCatalogsUI();
        syncNewPartSupplierPricesUI(); // schowa panel
    }
});

window.askDeletePart = (sku) => {
    if(confirm("Czy na pewno usunąć tę część?")) {
        const err = deletePart(sku);
        if (err) toast("Nie można usunąć", err, "bad");
        else { toast("Usunięto", sku, "ok"); refreshCatalogsUI(); }
    }
};

document.getElementById("addSupplierBtn")?.addEventListener("click", () => {
    const name = document.getElementById("supplierNameInput").value;
    const added = addSupplier(name);
    if (added) {
        document.getElementById("supplierNameInput").value = "";
    }
});
window.askDeleteSupplier = (n) => { if(confirm("Czy na pewno usunąć dostawcę " + n + "?")) deleteSupplier(n); };

// --- Editors Inline ---
let editingSup = null;
let editingMachine = null;
let editingMachineIsNew = false;

// Tworzenie maszyny: od razu edytujesz BOM (tak samo jak w trybie edycji).
// Wcześniej tworzyło pustą maszynę i dopiero potem trzeba było klikać „Edytuj BOM”.
document.getElementById("addMachineBtn")?.addEventListener("click", () => {
    const c = normalize(document.getElementById("machineCodeInput").value);
    const n = normalize(document.getElementById("machineNameInput").value);

    if (!c || !n) {
        toast("Błąd", "Podaj kod i nazwę maszyny.", "warn");
        return;
    }
    if (state.machineCatalog.some(m => m.code === c)) {
        toast("Błąd", "Maszyna o podanym kodzie już istnieje.", "warn");
        return;
    }

    // Startuj w trybie „nowa maszyna” i pozwól od razu budować skład.
    editingMachineIsNew = true;
    editingMachine = { code: c, name: n, bom: [] };
    openMachineEditor("__NEW__");
});
window.askDeleteMachine = (code) => {
    if(confirm("Czy na pewno usunąć maszynę " + code + "?")) {
        state.machineCatalog = state.machineCatalog.filter(m => m.code !== code);
        save(); refreshCatalogsUI();
    }
};

window.openSupplierEditor = (name) => {
    editingSup = name;
    const panel = document.getElementById("supplierEditorTemplate");
    document.getElementById("supplierEditorName").textContent = name;
    
    const sel = document.getElementById("supplierEditorPartSelect");
    sel.innerHTML = '<option value="">-- Wybierz --</option>' + Array.from(state.partsCatalog.values()).map(p =>
        `<option value="${p.sku}">${p.sku} (${p.name})</option>`
    ).join("");
    try { refreshComboFromSelect(sel, { placeholder: "Wybierz część..." }); } catch {}
    
    renderSupEditorTable();
    panel.hidden = false;
    panel.scrollIntoView({behavior: "smooth"});
};

function renderSupEditorTable() {
    const tbody = byId("supplierEditorPriceBody");
    const sup = editingSup ? state.suppliers.get(editingSup) : null;
    if (!tbody || !sup || !sup.prices) return;
    tbody.innerHTML = Array.from(sup.prices.entries()).map(([k, price]) => {
        const p = state.partsCatalog.get(k);
        return `<tr><td>${p ? p.sku : k}</td><td>${p ? p.name : '-'}</td><td>${fmtPLN.format(price)}</td></tr>`;
    }).join("");
}

document.getElementById("supplierEditorSetPriceBtn")?.addEventListener("click", () => {
    const sku = document.getElementById("supplierEditorPartSelect").value;
    const price = document.getElementById("supplierEditorPriceInput").value;
    updateSupplierPrice(editingSup, sku, price);
    renderSupEditorTable();
});

document.getElementById("supplierEditorSaveBtn")?.addEventListener("click", () => {
    document.getElementById("supplierEditorTemplate").hidden = true;
    editingSup = null;
    renderAllSuppliers();
    refreshCatalogsUI();
});
document.getElementById("supplierEditorCancelBtn")?.addEventListener("click", () => {
    document.getElementById("supplierEditorTemplate").hidden = true;
    editingSup = null;
});

window.openMachineEditor = (code) => {
    // Special mode: creating a new machine uses a temporary object in memory.
    if (code !== "__NEW__") {
        editingMachineIsNew = false;
        editingMachine = state.machineCatalog.find(m => m.code === code);
        if (!editingMachine) return;
    } else {
        // editingMachine must already be set by the creator flow
        if (!editingMachine) return;
    }
    
    const panel = document.getElementById("machineEditorTemplate");
    document.getElementById("machineEditorName").textContent = editingMachine.name;
    document.getElementById("machineEditorCode").textContent = editingMachine.code;
    
    const sel = document.getElementById("bomSkuSelect");
    sel.innerHTML = '<option value="">-- Wybierz --</option>' + Array.from(state.partsCatalog.values()).map(p =>
        `<option value="${p.sku}">${p.sku} (${p.name})</option>`
    ).join("");
    try { refreshComboFromSelect(sel, { placeholder: "Wybierz część..." }); } catch {}

    renderBomTable();
    panel.hidden = false;
    panel.scrollIntoView({behavior: "smooth"});
};

function renderBomTable() {
    const tbody = document.querySelector("#bomTable tbody");
    if (!tbody || !editingMachine || !Array.isArray(editingMachine.bom)) return;
    tbody.innerHTML = editingMachine.bom.map((b, idx) => {
        const p = state.partsCatalog.get(skuKey(b.sku));
        return `<tr>
            <td><span class="badge">${b.sku}</span></td>
            <td>${p ? p.name : "???"}</td>
            <td class="right">${b.qty}</td>
            <td class="right"><button class="iconBtn" onclick="removeBomItem(${idx})">Usuń</button></td>
        </tr>`;
    }).join("");

    // Enforce invariant: BOM cannot be empty.
    const saveBtn = document.getElementById("machineEditorSaveBtn");
    if (saveBtn) saveBtn.disabled = !editingMachine.bom.length;
}

document.getElementById("addBomItemBtn")?.addEventListener("click", () => {
    const sku = document.getElementById("bomSkuSelect").value;
    if (!sku) {
        toast("Błąd", "Wybierz część do składu.", "warn");
        return;
    }
    const qty = safeInt(document.getElementById("bomQtyInput").value);
    
    const existing = editingMachine.bom.find(b => skuKey(b.sku) === skuKey(sku));
    if (existing) existing.qty = qty;
    else editingMachine.bom.push({ sku, qty });
    
    renderBomTable();
});

window.removeBomItem = (idx) => {
    editingMachine.bom.splice(idx, 1);
    renderBomTable();
};

document.getElementById("machineEditorSaveBtn")?.addEventListener("click", () => {
    if (!editingMachine) return;
    if (!Array.isArray(editingMachine.bom) || editingMachine.bom.length === 0) {
        toast("Błąd", "Nie można zapisać maszyny bez składników.", "warn");
        return;
    }

    // If it's a brand-new machine, only now commit it to the catalog.
    if (editingMachineIsNew) {
        state.machineCatalog.push({
            code: editingMachine.code,
            name: editingMachine.name,
            bom: editingMachine.bom.map(b => ({ sku: b.sku, qty: safeInt(b.qty) }))
        });
        // Clear create form fields after successful create
        const codeIn = document.getElementById("machineCodeInput");
        const nameIn = document.getElementById("machineNameInput");
        if (codeIn) codeIn.value = "";
        if (nameIn) nameIn.value = "";
        editingMachineIsNew = false;
        toast("OK", "Dodano maszynę.", "ok");
    }

    save();
    document.getElementById("machineEditorTemplate").hidden = true;
    editingMachine = null;
    refreshCatalogsUI();
});
document.getElementById("machineEditorCancelBtn")?.addEventListener("click", () => {
    document.getElementById("machineEditorTemplate").hidden = true;
    // New machine: just discard the temporary object.
    if (editingMachineIsNew) {
        editingMachineIsNew = false;
        editingMachine = null;
        return;
    }
    // Existing: revert unsaved changes by reloading state.
    load();
    editingMachine = null;
});

// Common Bindings
function bindTabs() {
    const btns = document.querySelectorAll(".tabBtn");
    btns.forEach(btn => {
        btn.addEventListener("click", () => {
            if (editingMachine) {
                document.getElementById("machineEditorCancelBtn")?.click();
                editingMachine = null;
            }
            const supPanel = byId("supplierEditorTemplate");
            if (supPanel && !supPanel.hidden) {
                document.getElementById("supplierEditorCancelBtn")?.click();
                editingSup = null;
            }
            if (!document.getElementById("partEditSection").hidden) {
                document.getElementById("cancelEditPartBtn")?.click();
            }
            btns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".tabPanel").forEach(p => p.hidden = true);
            document.querySelector(`[data-tab-panel="${btn.dataset.tabTarget}"]`).hidden = false;
            if (btn.dataset.tabTarget === "history") { renderHistory(); }
        });
    });
}

function bindSearch() {
    document.getElementById("searchParts")?.addEventListener("input", renderWarehouse);
    document.getElementById("searchMachines")?.addEventListener("input", renderMachinesStock);
}

document.getElementById("clearDataBtn")?.addEventListener("click", () => {
    if(confirm("Czy na pewno chcesz usunąć WSZYSTKIE dane?")) resetData();
});

// Drugi przycisk resetu w zakładce Historia (ten sam efekt)
document.getElementById("clearDataBtnHistory")?.addEventListener("click", () => {
    if(confirm("Czy na pewno chcesz usunąć WSZYSTKIE dane?")) resetData();
});

try { init(); } catch (e) { console.error(e); toast("Błąd", "Init aplikacji przerwany (szczegóły w konsoli).", "bad"); }
// === EDYCJA CZĘŚCI (Baza Części) ===

function buildEditPartSuppliersChecklist(partKey) {
    const box = document.getElementById("editPartSuppliersChecklist");
    if (!box) return;

    const allSups = Array.from(state.suppliers.keys()).sort();
    if (!allSups.length) {
        box.innerHTML = '<span class="small muted">Brak zdefiniowanych dostawców.</span>';
        return;
    }

    // multi-combobox (spójne z resztą UI)
    const selected = allSups.filter(name => {
        const sup = state.suppliers.get(name);
        return !!(sup && sup.prices && sup.prices.has(partKey));
    });

    if (typeof comboMultiRender === "function") {
        comboMultiRender(box, {
            options: allSups,
            selected,
            placeholder: "Wybierz dostawców..."
        });
    } else {
        // Fallback: jeśli z jakiegoś powodu UI helper nie jest dostępny
        box.innerHTML = '<span class="small muted">Błąd UI: brak kontrolki wyboru dostawców.</span>';
    }
}

function startEditPart(sku) {
    const section = document.getElementById("partEditSection");
    const title = document.getElementById("partEditTitle");
    const skuInput = document.getElementById("editPartSkuInput");
    const nameInput = document.getElementById("editPartNameInput");

    if (!section || !title || !skuInput || !nameInput) {
        return toast("Brakuje elementów UI do edycji części (HTML).");
    }

    const key = skuKey(sku);
    const part = state.partsCatalog.get(key);
    if (!part) return toast("Nie znaleziono części w bazie.");

    currentEditPartKey = key;

    title.textContent = `Edycja Części: ${part.sku}`;
    skuInput.value = part.sku;
    nameInput.value = part.name || "";

    buildEditPartSuppliersChecklist(key);
    syncEditPartSupplierPricesUI();

    section.hidden = false;
    // slide-open (hidden nie da się animować, więc robimy transition po klasie)
    section.classList.add("collapsed");
    requestAnimationFrame(() => {
        section.classList.remove("collapsed");
        setTimeout(() => section.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    });
}

function cancelEditPart() {
    const section = document.getElementById("partEditSection");
    if (section) {
        section.classList.add("collapsed");
        const onEnd = () => { section.hidden = true; };
        section.addEventListener("transitionend", onEnd, { once: true });
    }

    currentEditPartKey = null;

    // schowaj panel cen dostawców
    const pricePanel = document.getElementById("editPartSupplierPrices");
    if (pricePanel) { pricePanel.hidden = true; const body = pricePanel.querySelector(".supplierPriceBody"); if (body) body.innerHTML = ""; }

    const title = document.getElementById("partEditTitle");
    if (title) title.textContent = "Edycja Części";

    const skuInput = document.getElementById("editPartSkuInput");
    const nameInput = document.getElementById("editPartNameInput");
    if (skuInput) skuInput.value = "";
    if (nameInput) nameInput.value = "";
}

function saveEditPart() {
    if (!currentEditPartKey) return toast("Nie wybrano części do edycji.");

    const nameInput = document.getElementById("editPartNameInput");
    const checklist = document.getElementById("editPartSuppliersChecklist");

    const part = state.partsCatalog.get(currentEditPartKey);
    if (!part) return toast("Nie znaleziono części w bazie.");

    const newName = (nameInput?.value || "").trim();
    if (!newName) return toast("Uzupełnij pole Typ (Opis).");

    // Aktualizacja opisu
    part.name = newName;

    // Aktualizacja przypisania do dostawców
    if (checklist) {
        const checkedArr = (typeof comboMultiGetSelected === "function") ? comboMultiGetSelected(checklist) : [];
        const checked = new Set(checkedArr);

        for (const [supName, sup] of state.suppliers.entries()) {
            const has = sup.prices.has(currentEditPartKey);
            const shouldHave = checked.has(supName);

            if (shouldHave && !has) {
                sup.prices.set(currentEditPartKey, 0);
            } else if (!shouldHave && has) {
                sup.prices.delete(currentEditPartKey);
            }
        }

    }

    // Aktualizacja cen (tylko dla zaznaczonych dostawców)
    const pricePanel = document.getElementById("editPartSupplierPrices");
    if (pricePanel && !pricePanel.hidden) {
        const inputs = pricePanel.querySelectorAll('input[data-sup]');
        inputs.forEach(inp => {
            const supName = inp.getAttribute("data-sup");
            if (!supName) return;
            updateSupplierPrice(supName, part.sku, inp.value);
        });
    }

    save();
    refreshCatalogsUI();
    cancelEditPart();
    toast("Zapisano zmiany części.");
}


// === Supplier prices UI (Baza Części) ===
function bindSupplierPricesUI() {
    if (window.__supplierPricesBound) return;
    window.__supplierPricesBound = true;

    // NEW PART: supplier picker changes
    const newBox = document.getElementById("partNewSuppliersChecklist");
    newBox?.addEventListener("change", () => syncNewPartSupplierPricesUI());

    // NEW PART: SKU changes (so we can bind prices to proper key)
    document.getElementById("partSkuInput")?.addEventListener("input", () => {
        syncNewPartSupplierPricesUI();
    });

    // EDIT PART: supplier picker changes
    const editBox = document.getElementById("editPartSuppliersChecklist");
    editBox?.addEventListener("change", () => syncEditPartSupplierPricesUI());
}

function renderSupplierPricesPanel(panelEl, selectedSuppliers, partKey, opts = {}) {
    if (!panelEl) return;
    const body = panelEl.querySelector(".supplierPriceBody");
    if (!body) return;

    const skuEmpty = !!opts.skuEmpty;
    const disableInputs = !!opts.disableInputs;

    if (!selectedSuppliers || selectedSuppliers.length === 0) {
        panelEl.hidden = true;
        body.innerHTML = "";
        return;
    }

    panelEl.hidden = false;

    // If SKU is empty (new part), don't let user type prices that we can't safely map yet
    if (skuEmpty || !partKey) {
        body.innerHTML = `<div class="supplierPriceHint">Wpisz najpierw <strong>Nazwa (Unikalne ID)</strong>, żeby przypisać ceny do dostawców.</div>`;
        return;
    }

    body.innerHTML = selectedSuppliers.map(supName => {
        const sup = state.suppliers.get(supName);
        const current = sup && sup.prices ? (sup.prices.get(partKey) ?? 0) : 0;

        return `
            <div class="supplierPriceRow">
                <div class="supplierName">
                    <span class="supplierLabel">${supName}</span>
                    <span class="supplierMeta">aktualnie: ${fmtPLN.format(safeFloat(current))}</span>
                </div>
                <input type="number" min="0" step="0.01"
                    ${disableInputs ? "disabled" : ""}
                    data-sup="${supName}"
                    value="${safeFloat(current)}"
                    aria-label="Cena dla dostawcy ${supName}">
            </div>
        `;
    }).join("");
}

function syncNewPartSupplierPricesUI() {
    const skuEl = document.getElementById("partSkuInput");
    const skuVal = skuEl ? skuEl.value : "";
    const key = skuKey(skuVal);

    const box = document.getElementById("partNewSuppliersChecklist");
    const selected = (typeof comboMultiGetSelected === "function") ? comboMultiGetSelected(box) : [];
    const panel = document.getElementById("newPartSupplierPrices");

    renderSupplierPricesPanel(panel, selected, key, {
        skuEmpty: !normalize(skuVal),
        disableInputs: false
    });
}

function syncEditPartSupplierPricesUI() {
    const panel = document.getElementById("editPartSupplierPrices");
    const key = currentEditPartKey;

    const checklist = document.getElementById("editPartSuppliersChecklist");
    const selected = (typeof comboMultiGetSelected === "function") ? comboMultiGetSelected(checklist) : [];

    renderSupplierPricesPanel(panel, selected, key, { skuEmpty: false, disableInputs: false });
}
