#!/usr/bin/env node
// Prepares the data for the import order workbook (build_order_file.py).
//
//   node steel-dashboard/order-file/extract.js parts.xls MlyTimhur3.xls OpnOrdSup.xls \
//        [--draft draft.json] --out order.json
//
// --draft is the order draft saved by the dashboard ("שמירת טיוטה לקובץ", or the page's
// stored draft). Without it the recommended quantities are used as they are.
// The output holds company data: write it outside the repository.

"use strict";
const fs = require("fs");
const M = require("../src/model.js");

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args.splice(i, 2)[1];
};
const out = opt("--out");
const draftPath = opt("--draft");
if (args.length !== 3 || !out) {
  console.error("usage: extract.js parts.xls MlyTimhur3.xls OpnOrdSup.xls [--draft draft.json] --out order.json");
  process.exit(1);
}

const texts = args.map((f) => M.decode(fs.readFileSync(f)));
const snap = M.extract(texts);

// Supplier numbers are not part of the dashboard snapshot; read them from the orders export.
const supplierNo = {};
texts.forEach((t) => {
  const table = M.parseTsv(t);
  if (M.detectKind(table.header) !== "orders") return;
  const no = table.header.indexOf("מס_ספק");
  const name = table.header.indexOf("שם_ספק");
  table.rows.forEach((r) => { supplierNo[(r[name] || "").trim()] = (r[no] || "").trim(); });
});

const draft = draftPath ? JSON.parse(fs.readFileSync(draftPath, "utf8")) : null;
const useDraft = draft && draft.v === 2;
const leadMonths = (useDraft && draft.leadMonths) || M.DEFAULT_LEAD_MONTHS;
const d = M.compute(snap, { excludeWh: M.DEFAULT_EXCLUDED_WH, leadMonths });
const params = M.defaultPlanParams(d);
if (useDraft && draft.params) {
  Object.keys(params).forEach((m) => Object.assign(params[m], draft.params[m] || {}));
}
const overrides = (draft && draft.qtyKg) || {};
const pl = M.plan(d, params);
const R = M.recommend(d, pl);

// Main foreign supplier per material and family: the most open tons in current orders.
const famTons = {};
d.lines.forEach((l) => {
  if (l.draft || l.currency !== "$" || l.kgOpen <= 0) return;
  const k = l.material + "|" + l.family;
  famTons[k] = famTons[k] || {};
  famTons[k][l.supplier] = (famTons[k][l.supplier] || 0) + l.kgOpen;
});
const mainSupplier = (k) => {
  const m = famTons[k];
  return m ? Object.entries(m).sort((a, b) => b[1] - a[1])[0][0] : null;
};

const openSwaps = R.swaps.filter((p) => p.state === "open");
const swapFor = {};
openSwaps.forEach((p) => p.candidates.forEach((r) => {
  (swapFor[r.item.sku] = swapFor[r.item.sku] || []).push(p.po + " עד " + p.changeUntil);
}));

const rows = [];
pl.groups.forEach((g) => {
  const hasHalf = g.rows.some((r) => r.item.half);
  const long = g.rows.find((r) => r.item.lengthM === 12 && !r.item.china && r.item.active);
  g.rows.forEach((r) => {
    const x = r.item;
    const usd = x.lines.filter((l) => !l.draft && l.currency === "$")
      .sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || ""));
    let supplier = null;
    let supplierSrc = null;
    if (usd.length) { supplier = usd[0].supplier; supplierSrc = "sku"; }
    else { supplier = mainSupplier(x.material + "|" + x.family); supplierSrc = supplier ? "family" : null; }
    const qty = overrides[x.sku] != null ? overrides[x.sku] : r.rec;
    rows.push({
      sku: x.sku, desc: x.desc, profile: g.profile.base, profileName: g.profile.name,
      material: x.material, family: x.family, lengthM: x.lengthM, china: x.china, active: x.active,
      half: !!x.half, cutTarget: !!(hasHalf && long && long === r),
      stockKg: x.stockKg, cons: Math.max(x.cons, 0),
      price: r.price, priceSrc: r.price ? (r.priceFromSku ? "sku" : "family") : null,
      supplier, supplierNo: supplier ? supplierNo[supplier] || "" : "", supplierSrc,
      swap: swapFor[x.sku] || [], qtyKg: qty, overridden: overrides[x.sku] != null,
      // model values, used by the workbook builder to check its formulas
      check: { inA: r.inA, inC: r.inC, carryInA: r.carryInA, carryInC: r.carryInC, atA: r.atA,
        local: r.local, need: r.need, rec: r.rec },
    });
  });
});

const openLines = d.lines.filter((l) => !l.draft && l.kgOpen > 0).map((l) => ({
  po: l.po, supplier: l.supplier, sku: l.sku, desc: l.desc, kgOpen: l.kgOpen, eta: l.eta,
  orderDate: l.orderDate, status: l.status, ship: l.ship,
}));

const result = {
  refDate: d.refDate, stockRun: snap.meta.stockRun, ordersRun: snap.meta.ordersRun,
  leadMonths, params, minKg: M.MIN_LINE_KG, changeWindowMonths: M.CHANGE_WINDOW_MONTHS,
  excludedWh: d.totals.excludedWh, draft: draft ? { savedAt: draft.savedAt, overrides: Object.keys(overrides).length } : null,
  rows, openLines,
  swaps: R.swaps.filter((p) => p.state !== "shipped").map((p) => ({
    po: p.po, supplier: p.supplier, state: p.state, orderDate: p.orderDate, changeUntil: p.changeUntil,
    eta: p.eta, kg: p.kg, usd: p.usd,
    lines: p.lines.map((l) => ({ sku: l.sku, desc: l.desc, kg: l.kg, coverage: l.coverage, cons: l.cons })),
    candidates: p.candidates.map((r) => ({ sku: r.item.sku, desc: r.item.desc, local: r.local, rec: r.rec })),
  })),
  local: R.local.map((x) => ({
    sku: x.row.item.sku, desc: x.row.item.desc, material: x.row.item.material,
    stockKg: x.row.item.stockKg, cons: x.row.item.cons, runOut: x.monthsLeft <= 0.05 ? null : x.runOut,
    nextEta: x.row.item.nextEta, localKg: x.row.local,
  })),
};
fs.writeFileSync(out, JSON.stringify(result));
const ordered = rows.filter((r) => r.qtyKg > 0);
console.log(`${rows.length} rows, ${ordered.length} to order, ${ordered.reduce((s, r) => s + r.qtyKg, 0) / 1000} t` +
  `${draft ? `, draft ${draft.savedAt} with ${Object.keys(overrides).length} changed quantities` : ", no draft"}`);
