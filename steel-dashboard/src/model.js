/*
 * Structural steel ("ברזל מקצועי") dashboard model.
 *
 * Parses three Priority ERP exports (tab-separated text, windows-1255) and
 * computes stock, consumption, coverage and supplier-order metrics.
 * Runs unchanged in the browser (inlined into the page) and in Node (build.mjs).
 *
 *   parts.xls      - item master (מק_ט, ברזל_מקצועי, Min_Inventory ...)
 *   MlyTimhur3.xls - stock valuation per item / warehouse / bin (MACSAN, יתרה, ערך ...)
 *   OpnOrdSup.xls  - open supplier order lines (מס_הז, ית_לאספקה, תא ...)
 */
(function (root) {
  "use strict";

  var STRUCTURAL_TYPE = "מקצועי";
  var DRAFT_STATUS = "טיוטא";
  var DAYS_PER_MONTH = 30.44;
  var OVERSTOCK_MONTHS = 12;

  // ---------- parsing ----------

  function decode(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    try {
      var utf8 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return utf8.replace(/^﻿/, "");
    } catch (e) {
      return new TextDecoder("windows-1255").decode(bytes);
    }
  }

  function parseTsv(text) {
    var lines = text.split(/\r?\n/);
    var header = lines[0].split("\t").map(function (h) { return h.trim(); });
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      if (lines[i].trim()) rows.push(lines[i].split("\t"));
    }
    return { header: header, rows: rows };
  }

  // Returns a getter for the nth column with this name (Priority repeats some names).
  function column(header, name, nth) {
    var seen = 0;
    for (var i = 0; i < header.length; i++) {
      if (header[i] === name && seen++ === (nth || 0)) {
        return function (row) { return (row[i] || "").trim(); };
      }
    }
    throw new Error('missing column "' + name + '"');
  }

  function num(s) {
    var n = parseFloat(String(s).replace(/,/g, ""));
    return isFinite(n) ? n : 0;
  }

  // "05/10/26" or "05/10/26 12:30" -> "2026-10-05"
  function isoDate(s) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s || "");
    if (!m) return null;
    var y = m[3].length === 2 ? "20" + m[3] : m[3];
    return y + "-" + pad(m[2]) + "-" + pad(m[1]);
  }

  function pad(n) { return String(n).length < 2 ? "0" + n : String(n); }

  var KINDS = {
    parts: "ברזל_מקצועי",
    stock: "MACSAN",
    orders: "מס_הז",
  };

  function detectKind(header) {
    for (var k in KINDS) if (header.indexOf(KINDS[k]) !== -1) return k;
    return null;
  }

  // ---------- extract: raw exports -> compact snapshot (structural items only) ----------

  function extract(texts) {
    var tables = {};
    texts.forEach(function (t) {
      var table = parseTsv(t);
      var kind = detectKind(table.header);
      if (kind) tables[kind] = table;
    });
    var missing = Object.keys(KINDS).filter(function (k) { return !tables[k]; });
    if (missing.length) {
      var err = new Error("missing exports: " + missing.join(", "));
      err.missing = missing;
      throw err;
    }

    // Item master
    var p = tables.parts, ph = p.header;
    var P = {
      sku: column(ph, "מק_ט"), desc: column(ph, "תאור"), status: column(ph, "סטאטוס"),
      family: column(ph, "תאור_משפחה"), material: column(ph, "סוג_חומר"),
      type: column(ph, "תאור_טיפוס_משפחת_מוצר"), flag: column(ph, "ברזל_מקצועי"),
      kgm: column(ph, "משקל_ברזל_מקצ_למטר"), minInv: column(ph, "Min_Inventory"),
      avgOut: column(ph, "ממוצע_יציאות"), basePrice: column(ph, "מחיר_בסיסי"),
      costIls: column(ph, "עלות_ש_ח"), run: column(ph, "תאריך_הרצה"),
    };
    var parts = {};
    var flaggedOtherType = [];
    var unflagged = [];
    p.rows.forEach(function (r) {
      var structural = P.type(r) === STRUCTURAL_TYPE;
      var flagged = P.flag(r) === "Y";
      if (flagged && !structural) flaggedOtherType.push([P.sku(r), P.desc(r), P.type(r)]);
      if (!structural) return;
      if (!flagged) unflagged.push([P.sku(r), P.desc(r)]);
      parts[P.sku(r)] = {
        sku: P.sku(r), desc: P.desc(r), active: P.status(r) === "פעיל",
        family: P.family(r) || "אחר", material: P.material(r),
        kgm: num(P.kgm(r)), minInv: num(P.minInv(r)), avgOut: num(P.avgOut(r)),
        basePrice: num(P.basePrice(r)), costIls: num(P.costIls(r)), cons: null,
      };
    });

    // Stock valuation
    var s = tables.stock, sh = s.header;
    var S = {
      sku: column(sh, "מקט"), cost: column(sh, "ממן"), wh: column(sh, "MACSAN"),
      state: column(sh, "סטטוס", 1), qty: column(sh, "יתרה"), loc: column(sh, "איתור"),
      cons: column(sh, "צריכה_חודשית"), price: column(sh, "0מחירון_מחיר"),
      value: column(sh, "ערך"), run: column(sh, "תאריך_הרצה"),
    };
    var stock = [];
    var consMismatch = [];
    s.rows.forEach(function (r) {
      var part = parts[S.sku(r)];
      if (!part) return;
      if (part.cons === null) {
        part.cons = num(S.cons(r));
        part.priceList = num(S.price(r));
        part.unitCost = num(S.cost(r));
        if (Math.abs(part.cons - part.avgOut) > 0.5) {
          consMismatch.push([part.sku, part.cons, part.avgOut]);
        }
      }
      if (!S.wh(r)) return; // item listed without any stock record
      stock.push({
        sku: part.sku, wh: S.wh(r), state: S.state(r), loc: S.loc(r),
        qty: num(S.qty(r)), value: num(S.value(r)),
      });
    });

    // Open supplier orders
    var o = tables.orders, oh = o.header;
    var O = {
      supplier: column(oh, "שם_ספק"), contact: column(oh, "א_קשר"), po: column(oh, "מס_הז"),
      status: column(oh, "סטטוס"), orderDate: column(oh, "תא_הז"), supplyDate: column(oh, "ת_אספקה"),
      arrivalDate: column(oh, "ת_הגעה"), eta: column(oh, "תא"), line: column(oh, "ש"),
      supplierRef: column(oh, "הז_ספק"), shipment: column(oh, "ת_בוא"), payTerms: column(oh, "ת_תשלום"),
      paid: column(oh, "שולם"), type: column(oh, "טיפוס"), material: column(oh, "סוג"),
      family: column(oh, "תאור_מש"), sku: column(oh, "מקט"), desc: column(oh, "ת_פריט"),
      tonsOrdered: column(oh, "טון_הז"), tonsOpen: column(oh, "טון_ית"), unitPrice: column(oh, "מחיר_יח"),
      currency: column(oh, "מטבע"), pricePerTon: column(oh, "מחיר_לטון"), openValue: column(oh, "שווי_יתרה"),
      openUsd: column(oh, "יתרה_שווי_USD"), ship: column(oh, "אוניה"), containers: column(oh, "מכולות"),
      port: column(oh, "נמל_יעד"), run: column(oh, "תא_הרצה"),
    };
    var orders = [];
    o.rows.forEach(function (r) {
      if (O.type(r) !== STRUCTURAL_TYPE && !parts[O.sku(r)]) return;
      orders.push({
        po: O.po(r), line: num(O.line(r)), supplier: O.supplier(r), contact: O.contact(r),
        status: O.status(r), orderDate: isoDate(O.orderDate(r)),
        eta: isoDate(O.eta(r)) || isoDate(O.arrivalDate(r)) || isoDate(O.supplyDate(r)),
        hasArrivalDate: !!O.arrivalDate(r), supplierRef: O.supplierRef(r), shipment: O.shipment(r),
        payTerms: O.payTerms(r), paid: O.paid(r) === "שולם", material: O.material(r),
        family: O.family(r), sku: O.sku(r), desc: O.desc(r),
        kgOrdered: num(O.tonsOrdered(r)) * 1000, kgOpen: num(O.tonsOpen(r)) * 1000,
        currency: O.currency(r), pricePerTon: num(O.pricePerTon(r)),
        openValue: num(O.openValue(r)), openUsd: num(O.openUsd(r)),
        ship: O.ship(r), containers: num(O.containers(r)), port: O.port(r),
      });
    });

    var partList = Object.keys(parts).map(function (k) {
      var x = parts[k];
      if (x.cons === null) x.cons = x.avgOut;
      return x;
    });

    return {
      version: 1,
      meta: {
        partsRun: p.rows.length ? P.run(p.rows[0]) : "",
        stockRun: s.rows.length ? S.run(s.rows[0]) : "",
        ordersRun: o.rows.length ? O.run(o.rows[0]) : "",
        flaggedOtherType: flaggedOtherType,
        unflagged: unflagged,
        consMismatch: consMismatch,
      },
      parts: partList,
      stock: stock,
      orders: orders,
    };
  }

  // ---------- compute: snapshot -> dashboard metrics ----------

  function monthsBetween(fromIso, toIso) {
    return (Date.parse(toIso) - Date.parse(fromIso)) / 86400000 / DAYS_PER_MONTH;
  }

  function median(xs) {
    if (!xs.length) return null;
    var a = xs.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function bucketOf(x) {
    if (x.cons <= 0) return x.stockKg > 0.5 ? "dead" : "idle";
    if (x.stockKg <= 0.5) return "out";
    var c = x.stockKg / x.cons;
    if (c < 1) return "critical";
    if (c < 3) return "low";
    if (c <= OVERSTOCK_MONTHS) return "ok";
    return "over";
  }

  function compute(snap, opts) {
    opts = opts || {};
    var material = opts.material || "all";
    var refDate = isoDate(snap.meta.stockRun) || isoDate(snap.meta.ordersRun) ||
      new Date().toISOString().slice(0, 10);

    var keep = function (mat) { return material === "all" || mat === material; };
    var byS = {};
    var items = [];
    snap.parts.forEach(function (p) {
      if (!keep(p.material)) return;
      var x = {
        sku: p.sku, desc: p.desc, active: p.active, family: p.family, material: p.material,
        kgm: p.kgm, minInv: p.minInv, cons: p.cons, basePrice: p.basePrice,
        priceList: p.priceList || p.basePrice, unitCost: p.unitCost || p.costIls,
        stockKg: 0, valueIls: 0, negBins: 0, onOrderKg: 0, onOrderUsd: 0, draftKg: 0, lateKg: 0,
        nextEta: null, lines: [],
      };
      byS[p.sku] = x;
      items.push(x);
    });

    // Stock
    var warehouses = {};
    var negativeBins = [];
    var unlocatedKg = 0;
    var totalPositiveBinKg = 0;
    snap.stock.forEach(function (r) {
      var x = byS[r.sku];
      if (!x) return;
      x.stockKg += r.qty;
      x.valueIls += r.value;
      var w = warehouses[r.wh] || (warehouses[r.wh] = { wh: r.wh, kg: 0, value: 0 });
      w.kg += r.qty;
      w.value += r.value;
      if (r.qty < -0.5) {
        x.negBins++;
        negativeBins.push({ sku: r.sku, desc: x.desc, wh: r.wh, loc: r.loc, kg: r.qty });
      } else if (r.qty > 0) {
        totalPositiveBinKg += r.qty;
        if (!r.loc || r.loc === "0") unlocatedKg += r.qty;
      }
    });

    // Orders
    var lines = [];
    snap.orders.forEach(function (o) {
      var x = byS[o.sku];
      if (!x && material !== "all") return;
      var draft = o.status === DRAFT_STATUS;
      var late = !!o.eta && o.eta < refDate && o.kgOpen > 0;
      var line = Object.assign({}, o, { draft: draft, late: late });
      lines.push(line);
      if (!x || o.kgOpen <= 0) return;
      x.lines.push(line);
      if (draft) { x.draftKg += o.kgOpen; return; }
      x.onOrderKg += o.kgOpen;
      x.onOrderUsd += o.openUsd;
      if (late) x.lateKg += o.kgOpen;
      if (o.eta && (!x.nextEta || o.eta < x.nextEta)) x.nextEta = o.eta;
    });

    // Import lead time: order date -> expected arrival, per foreign-currency PO
    var poLead = {};
    lines.forEach(function (l) {
      if (l.draft || l.currency === 'ש"ח' || !l.orderDate || !l.eta) return;
      poLead[l.po] = monthsBetween(l.orderDate, l.eta);
    });
    var leadTime = median(Object.keys(poLead).map(function (k) { return poLead[k]; })) || 4;

    // Per-item derived metrics
    items.forEach(function (x) {
      x.coverage = x.cons > 0 ? x.stockKg / x.cons : null;
      x.pipeCoverage = x.cons > 0 ? (x.stockKg + x.onOrderKg) / x.cons : null;
      x.avgCost = x.stockKg > 0.5 ? x.valueIls / x.stockKg : x.unitCost;
      x.bucket = bucketOf(x);
      x.monthsToEta = x.nextEta ? Math.max(0, monthsBetween(refDate, x.nextEta)) : null;
      // Reorder point: stock + open orders won't last as long as a new import takes.
      x.reorder = x.cons > 0 && x.pipeCoverage < leadTime;
      x.coverNeedKg = x.reorder ? x.cons * leadTime - (x.stockKg + x.onOrderKg) : 0;
      // Will run out before the next open order lands.
      x.gapKg = 0;
      if (x.cons > 0 && x.onOrderKg > 0 && x.monthsToEta !== null) {
        var need = x.cons * x.monthsToEta;
        if (Math.max(x.stockKg, 0) < need) x.gapKg = need - Math.max(x.stockKg, 0);
      }
      x.overOrdered = x.onOrderKg > 0 && (x.cons <= 0 || x.stockKg / x.cons > OVERSTOCK_MONTHS);
      x.belowMin = x.active && x.minInv > 0 && x.stockKg < x.minInv;
    });

    var visible = items.filter(function (x) { return x.bucket !== "idle" || x.onOrderKg > 0; });

    // Totals
    var T = { stockKg: 0, valueIls: 0, consKg: 0, onOrderKg: 0, draftKg: 0, lateKg: 0, onOrderUsd: 0, draftUsd: 0 };
    items.forEach(function (x) {
      T.stockKg += x.stockKg; T.valueIls += x.valueIls; T.consKg += Math.max(x.cons, 0);
    });
    lines.forEach(function (l) {
      if (l.kgOpen <= 0) return;
      if (l.draft) { T.draftKg += l.kgOpen; T.draftUsd += l.openUsd; return; }
      T.onOrderKg += l.kgOpen; T.onOrderUsd += l.openUsd;
      if (l.late) T.lateKg += l.kgOpen;
    });
    T.coverage = T.consKg > 0 ? T.stockKg / T.consKg : null;
    T.pipeCoverage = T.consKg > 0 ? (T.stockKg + T.onOrderKg) / T.consKg : null;
    T.avgCost = T.stockKg > 0 ? T.valueIls / T.stockKg : null;

    // Families
    var famMap = {};
    items.forEach(function (x) {
      var f = famMap[x.family] || (famMap[x.family] = {
        family: x.family, skus: 0, stockKg: 0, valueIls: 0, consKg: 0, onOrderKg: 0,
        listValue: 0, costValue: 0, critical: 0, over: 0, byMaterial: {},
      });
      if (x.bucket !== "idle" || x.onOrderKg > 0) f.skus++;
      f.stockKg += x.stockKg; f.valueIls += x.valueIls; f.consKg += Math.max(x.cons, 0);
      f.onOrderKg += x.onOrderKg;
      f.byMaterial[x.material] = (f.byMaterial[x.material] || 0) + x.stockKg;
      if (x.stockKg > 0 && x.priceList > 0 && x.avgCost > 0) {
        f.listValue += x.stockKg * x.priceList; f.costValue += x.stockKg * x.avgCost;
      }
      if (x.bucket === "out" || x.bucket === "critical") f.critical++;
      if (x.bucket === "over" || x.bucket === "dead") f.over++;
    });
    var families = Object.keys(famMap).map(function (k) {
      var f = famMap[k];
      f.coverage = f.consKg > 0 ? f.stockKg / f.consKg : null;
      f.pipeCoverage = f.consKg > 0 ? (f.stockKg + f.onOrderKg) / f.consKg : null;
      f.listMargin = f.listValue > 0 ? 1 - f.costValue / f.listValue : null;
      return f;
    }).filter(function (f) { return f.stockKg > 0.5 || f.consKg > 0 || f.onOrderKg > 0; })
      .sort(function (a, b) { return b.stockKg - a.stockKg; });

    // Material split
    var matMap = {};
    items.forEach(function (x) {
      var m = matMap[x.material] || (matMap[x.material] = { material: x.material, stockKg: 0, valueIls: 0, consKg: 0, onOrderKg: 0 });
      m.stockKg += x.stockKg; m.valueIls += x.valueIls; m.consKg += Math.max(x.cons, 0); m.onOrderKg += x.onOrderKg;
    });
    var materials = Object.keys(matMap).map(function (k) { return matMap[k]; })
      .filter(function (m) { return m.stockKg > 0.5 || m.onOrderKg > 0; });

    // Coverage buckets
    var bucketOrder = ["out", "critical", "low", "ok", "over", "dead"];
    var buckets = bucketOrder.map(function (b) {
      var xs = items.filter(function (x) { return x.bucket === b; });
      return {
        bucket: b, skus: xs.length,
        stockKg: xs.reduce(function (s, x) { return s + Math.max(x.stockKg, 0); }, 0),
        valueIls: xs.reduce(function (s, x) { return s + Math.max(x.valueIls, 0); }, 0),
        consKg: xs.reduce(function (s, x) { return s + x.cons; }, 0),
      };
    });

    // Arrivals by month (non-draft open lines), late lines in their own bucket
    var arrMap = {};
    lines.forEach(function (l) {
      if (l.draft || l.kgOpen <= 0) return;
      var key = l.late ? "late" : (l.eta ? l.eta.slice(0, 7) : "none");
      var a = arrMap[key] || (arrMap[key] = { key: key, byMaterial: {}, kg: 0, usd: 0, pos: {} });
      a.kg += l.kgOpen; a.usd += l.openUsd; a.pos[l.po] = true;
      a.byMaterial[l.material] = (a.byMaterial[l.material] || 0) + l.kgOpen;
    });
    var arrivals = Object.keys(arrMap).sort(function (a, b) {
      if (a === "late") return -1;
      if (b === "late") return 1;
      return a < b ? -1 : 1;
    }).map(function (k) { var a = arrMap[k]; a.poCount = Object.keys(a.pos).length; delete a.pos; return a; });

    // Purchase orders
    var poMap = {};
    lines.forEach(function (l) {
      var p = poMap[l.po] || (poMap[l.po] = {
        po: l.po, supplier: l.supplier, status: l.status, orderDate: l.orderDate, eta: l.eta,
        ship: l.ship, containers: l.containers, payTerms: l.payTerms, paid: l.paid, currency: l.currency,
        supplierRef: l.supplierRef, shipment: l.shipment, draft: l.draft,
        kgOrdered: 0, kgOpen: 0, usd: 0, value: 0, lines: [], materials: {}, late: false,
      });
      p.kgOrdered += l.kgOrdered; p.kgOpen += l.kgOpen; p.usd += l.openUsd; p.value += l.openValue;
      p.lines.push(l); p.materials[l.material] = true;
      if (l.late) p.late = true;
      if (l.eta && (!p.eta || l.eta < p.eta)) p.eta = l.eta;
    });
    var pos = Object.keys(poMap).map(function (k) {
      var p = poMap[k];
      p.materials = Object.keys(p.materials);
      p.pricePerTon = p.kgOpen > 0 ? p.usd / (p.kgOpen / 1000) : null;
      p.lead = p.orderDate && p.eta ? monthsBetween(p.orderDate, p.eta) : null;
      return p;
    }).filter(function (p) { return p.kgOpen > 0; })
      .sort(function (a, b) { return (a.eta || "9") < (b.eta || "9") ? -1 : 1; });

    // Suppliers
    var supMap = {};
    lines.forEach(function (l) {
      if (l.kgOpen <= 0) return;
      var s = supMap[l.supplier] || (supMap[l.supplier] = {
        supplier: l.supplier, kgOpen: 0, usd: 0, draftKg: 0, lateKg: 0, pos: {}, nextEta: null,
        byMaterial: {}, local: l.currency === 'ש"ח',
      });
      s.pos[l.po] = true;
      if (l.draft) { s.draftKg += l.kgOpen; return; }
      s.kgOpen += l.kgOpen; s.usd += l.openUsd;
      if (l.late) s.lateKg += l.kgOpen;
      if (l.eta && (!s.nextEta || l.eta < s.nextEta)) s.nextEta = l.eta;
      var m = s.byMaterial[l.material] || (s.byMaterial[l.material] = { kg: 0, usd: 0 });
      m.kg += l.kgOpen; m.usd += l.openUsd;
    });
    var suppliers = Object.keys(supMap).map(function (k) {
      var s = supMap[k];
      s.poCount = Object.keys(s.pos).length; delete s.pos;
      s.pricePerTon = s.kgOpen > 0 ? s.usd / (s.kgOpen / 1000) : null;
      return s;
    }).sort(function (a, b) { return (b.kgOpen + b.draftKg) - (a.kgOpen + a.draftKg); });

    // Data quality
    var minCounts = {};
    items.forEach(function (x) { if (x.active) minCounts[x.minInv] = (minCounts[x.minInv] || 0) + 1; });
    var activeCount = items.filter(function (x) { return x.active; }).length;
    var topMin = Object.keys(minCounts).sort(function (a, b) { return minCounts[b] - minCounts[a]; })[0];
    var quality = {
      netNegative: items.filter(function (x) { return x.stockKg < -0.5; })
        .sort(function (a, b) { return a.stockKg - b.stockKg; }),
      negativeBins: negativeBins.sort(function (a, b) { return a.kg - b.kg; }),
      unlocatedKg: unlocatedKg,
      unlocatedShare: totalPositiveBinKg > 0 ? unlocatedKg / totalPositiveBinKg : 0,
      lateLines: lines.filter(function (l) { return l.late && !l.draft; }),
      defaultMin: { value: num(topMin), count: minCounts[topMin] || 0, of: activeCount },
      noMin: items.filter(function (x) { return x.active && x.minInv <= 0 && x.cons > 0; }),
      flaggedOtherType: snap.meta.flaggedOtherType || [],
      unflagged: snap.meta.unflagged || [],
      consMismatch: snap.meta.consMismatch || [],
    };

    return {
      refDate: refDate, material: material, meta: snap.meta, leadTime: leadTime,
      leadTimes: Object.keys(poLead).map(function (k) { return { po: k, months: poLead[k] }; }),
      overstockMonths: OVERSTOCK_MONTHS,
      totals: T, quality: quality, items: items, visible: visible, families: families, materials: materials,
      buckets: buckets, arrivals: arrivals, pos: pos, lines: lines, suppliers: suppliers,
      warehouses: Object.keys(warehouses).map(function (k) { return warehouses[k]; })
        .sort(function (a, b) { return b.kg - a.kg; }),
      actions: {
        reorder: items.filter(function (x) { return x.reorder && x.active; })
          .sort(function (a, b) { return b.cons - a.cons; }),
        gap: items.filter(function (x) { return x.gapKg > 0; })
          .sort(function (a, b) { return b.gapKg - a.gapKg; }),
        overOrdered: items.filter(function (x) { return x.overOrdered; })
          .sort(function (a, b) { return b.onOrderKg - a.onOrderKg; }),
        dead: items.filter(function (x) { return x.bucket === "dead"; })
          .sort(function (a, b) { return b.valueIls - a.valueIls; }),
      },
    };
  }

  var api = {
    decode: decode, parseTsv: parseTsv, detectKind: detectKind,
    extract: extract, compute: compute, isoDate: isoDate,
  };
  root.SteelModel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
