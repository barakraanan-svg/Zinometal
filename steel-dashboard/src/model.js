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

  // ---------- profiles: one size of one section, across its stock lengths ----------
  //
  // "UPN160" (6m) and "UPN160-12" (12m) are the same profile in two lengths.
  // The length comes from the SKU suffix, else from the description; Chinese-origin
  // variants ("...C", description "סיני") join the same profile.

  var LENGTH_SUFFIX = /-(12\.1|12|6\.05|6|3)$/;
  var DESC_LENGTH = /(^|\s)(12\.1|12|6\.05|6|3)\s*(m(?![a-z])|מ'|מטר|מ(?=\s|$)|מג)/i;

  function profileOf(sku, desc, material) {
    var base = sku, len = null;
    var m = LENGTH_SUFFIX.exec(sku);
    if (m) { len = +m[1]; base = sku.slice(0, m.index); }
    if (len === null) {
      var d = DESC_LENGTH.exec(desc);
      if (d) len = +d[2];
    }
    var china = /סיני/.test(desc);
    if (china && /C$/.test(base)) base = base.slice(0, -1);
    var lengthM = len === null ? null : len >= 11 ? 12 : len >= 5.5 ? 6 : len;
    // 6.05m is exactly half of 12.1m: those pieces are cut in-house, not imported.
    var half = len === 6.05;
    return { key: material + "|" + base, base: base, lengthM: lengthM, china: china, half: half };
  }

  function profileName(desc) {
    return desc.replace(DESC_LENGTH, "$1").replace(/(^|\s)(ב?אורך|סיני)(?=\s|$)/g, " ")
      .replace(/\s+/g, " ").trim();
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

  // Coverage, reorder and gap metrics; shared by single SKUs and whole profiles.
  function derive(x, refDate, leadTime) {
    x.leadTime = leadTime;
    x.coverage = x.cons > 0 ? x.stockKg / x.cons : null;
    x.pipeCoverage = x.cons > 0 ? (x.stockKg + x.onOrderKg) / x.cons : null;
    x.avgCost = x.stockKg > 0.5 ? x.valueIls / x.stockKg : x.unitCost || null;
    x.bucket = bucketOf(x);
    x.monthsToEta = x.nextEta ? Math.max(0, monthsBetween(refDate, x.nextEta)) : null;
    // Reorder point: stock + open orders won't last as long as a new import takes.
    x.reorder = x.active && x.cons > 0 && x.pipeCoverage < leadTime;
    x.coverNeedKg = x.reorder ? x.cons * leadTime - (x.stockKg + x.onOrderKg) : 0;
    // Will run out before the next open order lands.
    x.gapKg = 0;
    if (x.cons > 0 && x.onOrderKg > 0 && x.monthsToEta !== null) {
      var need = x.cons * x.monthsToEta;
      if (Math.max(x.stockKg, 0) < need) x.gapKg = need - Math.max(x.stockKg, 0);
    }
    x.overOrdered = x.onOrderKg > 0 && (x.cons <= 0 || x.stockKg / x.cons > OVERSTOCK_MONTHS);
    x.belowMin = x.active && x.minInv > 0 && x.stockKg < x.minInv;
    return x;
  }

  // Median months from order date to expected arrival, per foreign-currency PO.
  function leadTimes(orders) {
    var po = {};
    orders.forEach(function (l) {
      if (l.status === DRAFT_STATUS || l.currency === 'ש"ח' || !l.orderDate || !l.eta) return;
      var p = po[l.po] || (po[l.po] = { po: l.po, months: monthsBetween(l.orderDate, l.eta), materials: {} });
      p.materials[l.material] = true;
    });
    var list = Object.keys(po).map(function (k) { return po[k]; });
    var byMaterial = {};
    ["BLA", "MEG", "GAL"].forEach(function (m) {
      var xs = list.filter(function (p) { return p.materials[m]; }).map(function (p) { return p.months; });
      if (xs.length) byMaterial[m] = { months: median(xs), count: xs.length };
    });
    return {
      all: median(list.map(function (p) { return p.months; })), list: list, byMaterial: byMaterial,
    };
  }

  var DEFAULT_LEAD = 4;
  // Business rule: imports take five months from order to arrival, black and galvanized alike.
  // The medians measured from open orders are still reported, for comparison.
  var DEFAULT_LEAD_MONTHS = 5;
  // Warehouses that never count as stock: 99 is not ours, 10 holds inquiries / non-existent stock.
  var DEFAULT_EXCLUDED_WH = ["99", "10"];

  function compute(snap, opts) {
    opts = opts || {};
    var material = opts.material || "all";
    var excluded = {};
    (opts.excludeWh || []).forEach(function (w) { excluded[w] = true; });
    var refDate = isoDate(snap.meta.stockRun) || isoDate(snap.meta.ordersRun) ||
      new Date().toISOString().slice(0, 10);

    var LT = leadTimes(snap.orders);
    var fixedLead = opts.leadMonths > 0 ? opts.leadMonths : null;
    var leadFor = function (mat) {
      return fixedLead || (LT.byMaterial[mat] && LT.byMaterial[mat].months) || LT.all || DEFAULT_LEAD;
    };
    var leadTime = fixedLead || (material === "all" ? (LT.all || DEFAULT_LEAD) : leadFor(material));

    var keep = function (mat) { return material === "all" || mat === material; };
    var byS = {};
    var items = [];
    snap.parts.forEach(function (p) {
      if (!keep(p.material)) return;
      var pf = profileOf(p.sku, p.desc, p.material);
      var x = {
        sku: p.sku, desc: p.desc, active: p.active, family: p.family, material: p.material,
        kgm: p.kgm, minInv: p.minInv, cons: p.cons, basePrice: p.basePrice,
        priceList: p.priceList || p.basePrice, unitCost: p.unitCost || p.costIls,
        profileKey: pf.key, base: pf.base, lengthM: pf.lengthM, china: pf.china, half: pf.half,
        stockKg: 0, valueIls: 0, negBins: 0, onOrderKg: 0, onOrderUsd: 0, draftKg: 0, lateKg: 0,
        nextEta: null, lines: [],
      };
      byS[p.sku] = x;
      items.push(x);
    });

    // Stock (excluded warehouses are reported, never counted)
    var warehouses = {};
    var negativeBins = [];
    var unlocatedKg = 0;
    var totalPositiveBinKg = 0;
    snap.stock.forEach(function (r) {
      var x = byS[r.sku];
      if (!x) return;
      var w = warehouses[r.wh] || (warehouses[r.wh] = { wh: r.wh, kg: 0, value: 0, excluded: !!excluded[r.wh] });
      w.kg += r.qty;
      w.value += r.value;
      if (excluded[r.wh]) return;
      x.stockKg += r.qty;
      x.valueIls += r.value;
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

    items.forEach(function (x) { derive(x, refDate, leadFor(x.material)); });

    // Profiles: each length stays visible inside its profile
    var profMap = {};
    items.forEach(function (x) {
      var g = profMap[x.profileKey] || (profMap[x.profileKey] = {
        key: x.profileKey, base: x.base, family: x.family, material: x.material, active: false,
        lengths: [], stockKg: 0, valueIls: 0, cons: 0, onOrderKg: 0, onOrderUsd: 0, draftKg: 0,
        lateKg: 0, nextEta: null, minInv: 0, unitCost: 0, priceList: 0,
      });
      g.lengths.push(x);
      g.active = g.active || x.active;
      g.stockKg += x.stockKg; g.valueIls += x.valueIls; g.cons += Math.max(x.cons, 0);
      g.onOrderKg += x.onOrderKg; g.onOrderUsd += x.onOrderUsd; g.draftKg += x.draftKg;
      g.lateKg += x.lateKg; g.minInv += x.minInv;
      if (x.nextEta && (!g.nextEta || x.nextEta < g.nextEta)) g.nextEta = x.nextEta;
    });
    var profiles = Object.keys(profMap).map(function (k) {
      var g = profMap[k];
      g.lengths.sort(function (a, b) {
        return (b.lengthM || 6) - (a.lengthM || 6) || (a.china ? 1 : 0) - (b.china ? 1 : 0) || (a.sku < b.sku ? -1 : 1);
      });
      g.name = profileName(g.lengths[0].desc) || g.base;
      g.unitCost = g.lengths[0].unitCost;
      return derive(g, refDate, leadFor(g.material));
    });
    var visible = profiles.filter(function (g) { return g.bucket !== "idle" || g.onOrderKg > 0; });

    // Totals
    var T = { stockKg: 0, valueIls: 0, consKg: 0, onOrderKg: 0, draftKg: 0, lateKg: 0, onOrderUsd: 0, draftUsd: 0, excludedKg: 0, excludedWh: [] };
    items.forEach(function (x) {
      T.stockKg += x.stockKg; T.valueIls += x.valueIls; T.consKg += Math.max(x.cons, 0);
    });
    Object.keys(warehouses).forEach(function (k) {
      if (warehouses[k].excluded) { T.excludedKg += warehouses[k].kg; T.excludedWh.push(k); }
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
        family: x.family, skus: 0, profiles: {}, stockKg: 0, valueIls: 0, consKg: 0, onOrderKg: 0,
        listValue: 0, costValue: 0, byMaterial: {},
      });
      if (x.bucket !== "idle" || x.onOrderKg > 0) { f.skus++; f.profiles[x.profileKey] = true; }
      f.stockKg += x.stockKg; f.valueIls += x.valueIls; f.consKg += Math.max(x.cons, 0);
      f.onOrderKg += x.onOrderKg;
      f.byMaterial[x.material] = (f.byMaterial[x.material] || 0) + x.stockKg;
      if (x.stockKg > 0 && x.priceList > 0 && x.avgCost > 0) {
        f.listValue += x.stockKg * x.priceList; f.costValue += x.stockKg * x.avgCost;
      }
    });
    var families = Object.keys(famMap).map(function (k) {
      var f = famMap[k];
      f.profileCount = Object.keys(f.profiles).length;
      delete f.profiles;
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

    // Coverage buckets, per profile
    var buckets = ["out", "critical", "low", "ok", "over", "dead"].map(function (b) {
      var xs = profiles.filter(function (x) { return x.bucket === b; });
      return {
        bucket: b, count: xs.length,
        stockKg: xs.reduce(function (s, x) { return s + Math.max(x.stockKg, 0); }, 0),
        valueIls: xs.reduce(function (s, x) { return s + Math.max(x.valueIls, 0); }, 0),
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
      Object.keys(s.byMaterial).forEach(function (m) {
        var b = s.byMaterial[m];
        b.pricePerTon = b.kg > 0 ? b.usd / (b.kg / 1000) : null;
      });
      return s;
    }).sort(function (a, b) { return (b.kgOpen + b.draftKg) - (a.kgOpen + a.draftKg); });

    // Data quality (per SKU: that is where Priority needs fixing)
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
      refDate: refDate, material: material, meta: snap.meta,
      leadTime: leadTime, leadFixed: !!fixedLead, leadTimes: LT.list, leadByMaterial: LT.byMaterial,
      leadMeasured: LT.all,
      overstockMonths: OVERSTOCK_MONTHS,
      totals: T, quality: quality, items: items, profiles: profiles, visible: visible,
      families: families, materials: materials, buckets: buckets, arrivals: arrivals,
      pos: pos, lines: lines, suppliers: suppliers,
      warehouses: Object.keys(warehouses).map(function (k) { return warehouses[k]; })
        .sort(function (a, b) { return b.kg - a.kg; }),
      actions: {
        reorder: profiles.filter(function (x) { return x.reorder; })
          .sort(function (a, b) { return b.cons - a.cons; }),
        gap: profiles.filter(function (x) { return x.gapKg > 0; })
          .sort(function (a, b) { return b.gapKg - a.gapKg; }),
        overOrdered: profiles.filter(function (x) { return x.overOrdered; })
          .sort(function (a, b) { return b.onOrderKg - a.onOrderKg; }),
        dead: profiles.filter(function (x) { return x.bucket === "dead"; })
          .sort(function (a, b) { return b.valueIls - a.valueIls; }),
      },
    };
  }

  // ---------- import plan ----------
  //
  // For each material the buyer picks the month the new order should arrive and the month
  // it has to last until. Per SKU, longest length first within its profile:
  //   at arrival  = stock + open orders due by then - consumption until then
  //   local       = what runs out before the import can land (bridge it locally)
  //   import need = consumption from arrival to "until" - stock at arrival - orders due in between
  // Surplus of a longer length passes down to the shorter ones (12m can be cut to 6m, not back).
  // A 6.05m need is added to its 12.1m sibling: 6.05m is cut from 12.1m, never imported.
  // A line is at least the minimum (5 t) and rounded up to the step; needs under half the
  // minimum are flagged, not ordered.

  // Smallest quantity worth a line on an import order; needs under half of it are not ordered.
  var MIN_LINE_KG = 5000;

  function addMonths(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + "-" + pad(m + 1);
  }

  function defaultPlanParams(d) {
    var ref = d.refDate.slice(0, 7);
    var params = {};
    ["BLA", "MEG"].forEach(function (m) {
      var lead = d.leadFixed ? d.leadTime : (d.leadByMaterial[m] && d.leadByMaterial[m].months) || d.leadTime;
      var arrival = addMonths(ref, Math.max(1, Math.round(lead)));
      params[m] = { arrival: arrival, until: addMonths(arrival, 3), stepKg: 5000, minKg: MIN_LINE_KG };
    });
    return params;
  }

  function plan(d, params) {
    // Recent dollar prices: per SKU, else per family and material
    var famPrice = {};
    d.lines.forEach(function (l) {
      if (l.draft || l.currency !== "$" || l.kgOpen <= 0) return;
      var k = l.family + "|" + l.material;
      var f = famPrice[k] || (famPrice[k] = { kg: 0, usd: 0 });
      f.kg += l.kgOpen; f.usd += l.openUsd;
    });
    var groups = [];
    d.profiles.forEach(function (g) {
      var P = params[g.material];
      if (!P || !g.active) return;
      var A = P.arrival + "-15", C = P.until + "-15";
      var toA = Math.max(0, monthsBetween(d.refDate, A));
      var span = Math.max(0, monthsBetween(A, C));
      var carryA = 0, carryC = 0;
      var rows = g.lengths.map(function (x) {
        var inA = 0, inC = 0, priceKg = 0, priceUsd = 0, lastSupplier = null, lastDate = "";
        x.lines.forEach(function (l) {
          if (l.draft || l.kgOpen <= 0) return;
          if (!l.eta || l.eta <= A) inA += l.kgOpen; else if (l.eta <= C) inC += l.kgOpen;
          if (l.currency === "$") { priceKg += l.kgOpen; priceUsd += l.openUsd; }
          if ((l.orderDate || "") >= lastDate) { lastDate = l.orderDate || ""; lastSupplier = l.supplier; }
        });
        var cons = Math.max(x.cons, 0);
        var carryInA = carryA, carryInC = carryC;
        var supplyA = x.stockKg + inA + carryA;
        var local = x.active ? Math.max(0, cons * toA - supplyA) : 0;
        var atA = Math.max(0, supplyA - cons * toA);
        var supplyC = atA + inC + carryC;
        var need = x.active ? Math.max(0, cons * span - supplyC) : 0;
        var surplus = Math.max(0, supplyC - cons * span);
        carryA = Math.min(surplus, atA);
        carryC = surplus - carryA;
        var fp = famPrice[x.family + "|" + x.material];
        var price = priceKg > 0 ? priceUsd / (priceKg / 1000) : fp && fp.kg > 0 ? fp.usd / (fp.kg / 1000) : null;
        return {
          item: x, inA: inA, inC: inC, carryInA: carryInA, carryInC: carryInC, atA: atA, local: local,
          need: need, ownNeed: need, cutKg: 0, cutTo: null, cutIn: 0,
          price: price, priceFromSku: priceKg > 0, lastSupplier: lastSupplier,
        };
      });
      var long = rows.filter(function (r) { return r.item.lengthM === 12 && !r.item.china && r.item.active; })[0];
      rows.forEach(function (r) {
        if (r.item.half && long && r.need > 0) {
          long.need += r.need; long.cutIn += r.need; r.cutKg = r.need; r.cutTo = long.item.sku; r.need = 0;
        }
      });
      var minKg = P.minKg || MIN_LINE_KG;
      rows.forEach(function (r) {
        r.rec = r.need >= minKg / 2 ? Math.max(minKg, Math.ceil(r.need / P.stepKg) * P.stepKg) : 0;
        r.small = r.need > 0 && r.rec === 0;
      });
      var sum = function (f) { return rows.reduce(function (s, r) { return s + f(r); }, 0); };
      groups.push({
        profile: g, rows: rows, toA: toA, span: span,
        need: sum(function (r) { return r.need; }), rec: sum(function (r) { return r.rec; }),
        local: sum(function (r) { return r.local; }),
      });
    });
    groups.sort(function (a, b) { return b.rec - a.rec || b.need - a.need || b.profile.cons - a.profile.cons; });
    return { params: params, groups: groups };
  }

  // ---------- purchasing recommendations ----------
  //
  // Built on top of an import plan. In priority order:
  //   swaps   - open foreign POs holding lines for profiles with over a year of stock, with the
  //             shortage SKUs (same material and family as that supplier already sells) to convert into
  //   local   - SKUs that run out before the import can land, earliest first
  //   late    - open lines past their expected date
  //   prices  - families bought from more than one supplier, cheapest first
  //   dead    - profiles with stock and no consumption

  // Business rule: an order can be changed only during its first month; after that it is closed,
  // shipped or not.
  var CHANGE_WINDOW_MONTHS = 1;

  function addCalendarMonths(iso, n) {
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1 + n, day = +iso.slice(8, 10);
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return y + "-" + pad(m + 1) + "-" + pad(Math.min(day, last));
  }

  function addDays(iso, days) {
    return new Date(Date.parse(iso) + days * 86400000).toISOString().slice(0, 10);
  }

  function recommend(d, pl) {
    var over = {};
    d.actions.overOrdered.forEach(function (g) { over[g.key] = g; });
    var sells = {};
    d.lines.forEach(function (l) {
      (sells[l.supplier] = sells[l.supplier] || {})[l.material + "|" + l.family] = true;
    });
    var short = [];
    pl.groups.forEach(function (g) {
      g.rows.forEach(function (r) { if (r.local > 0 || r.rec > 0) short.push(r); });
    });

    var poMap = {};
    d.items.forEach(function (x) {
      var g = over[x.profileKey];
      if (!g) return;
      x.lines.forEach(function (l) {
        if (l.draft || l.kgOpen <= 0 || l.currency === 'ש"ח') return;
        var p = poMap[l.po] || (poMap[l.po] = {
          po: l.po, supplier: l.supplier, status: l.status, eta: l.eta, ship: l.ship, orderDate: l.orderDate,
          changeUntil: l.orderDate ? addCalendarMonths(l.orderDate, CHANGE_WINDOW_MONTHS) : null, kg: 0, usd: 0, lines: [],
        });
        p.kg += l.kgOpen; p.usd += l.openUsd;
        (p.materials = p.materials || {})[x.material] = true;
        p.lines.push({ sku: x.sku, desc: x.desc, kg: l.kgOpen, usd: l.openUsd, coverage: g.coverage, cons: g.cons });
      });
    });
    var swaps = Object.keys(poMap).map(function (k) {
      var p = poMap[k];
      p.state = p.ship ? "shipped" : p.changeUntil && d.refDate <= p.changeUntil ? "open" : "locked";
      var fam = sells[p.supplier] || {};
      // Convert within the order's own material (black stays black), into families the supplier sells.
      p.candidates = short.filter(function (r) { return p.materials[r.item.material] && fam[r.item.material + "|" + r.item.family]; })
        .sort(function (a, b) { return (b.local + b.rec) - (a.local + a.rec); }).slice(0, 6);
      p.lines.sort(function (a, b) { return b.kg - a.kg; });
      return p;
    }).sort(function (a, b) {
      var rank = { open: 0, locked: 1, shipped: 2 };
      if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
      return (a.changeUntil || "") < (b.changeUntil || "") ? -1 : (a.changeUntil || "") > (b.changeUntil || "") ? 1 : b.kg - a.kg;
    });

    var local = short.filter(function (r) { return r.local > 0; }).map(function (r) {
      var x = r.item;
      var left = x.cons > 0 ? Math.max(x.stockKg, 0) / x.cons : null;
      return { row: r, monthsLeft: left, runOut: left === null ? null : addDays(d.refDate, left * DAYS_PER_MONTH) };
    }).sort(function (a, b) { return a.monthsLeft - b.monthsLeft || b.row.local - a.row.local; });

    var lateMap = {};
    d.quality.lateLines.forEach(function (l) {
      var p = lateMap[l.po] || (lateMap[l.po] = { po: l.po, supplier: l.supplier, eta: l.eta, kg: 0, lines: 0 });
      p.kg += l.kgOpen; p.lines++;
    });
    var late = Object.keys(lateMap).map(function (k) { return lateMap[k]; })
      .sort(function (a, b) { return a.eta < b.eta ? -1 : 1; });

    var pm = {};
    d.lines.forEach(function (l) {
      if (l.draft || l.currency !== "$" || l.kgOpen <= 0) return;
      var k = l.material + "|" + l.family;
      var f = pm[k] || (pm[k] = { material: l.material, family: l.family, sup: {} });
      var s = f.sup[l.supplier] || (f.sup[l.supplier] = { supplier: l.supplier, kg: 0, usd: 0 });
      s.kg += l.kgOpen; s.usd += l.openUsd;
    });
    var prices = Object.keys(pm).map(function (k) {
      var f = pm[k];
      f.suppliers = Object.keys(f.sup).map(function (s) {
        var x = f.sup[s]; x.pricePerTon = x.usd / (x.kg / 1000); return x;
      }).sort(function (a, b) { return a.pricePerTon - b.pricePerTon; });
      delete f.sup;
      f.spread = f.suppliers[f.suppliers.length - 1].pricePerTon - f.suppliers[0].pricePerTon;
      return f;
    }).filter(function (f) { return f.suppliers.length > 1; })
      .sort(function (a, b) { return b.spread - a.spread; });

    return { swaps: swaps, local: local, late: late, prices: prices, dead: d.actions.dead };
  }

  var api = {
    decode: decode, parseTsv: parseTsv, detectKind: detectKind,
    extract: extract, compute: compute, isoDate: isoDate,
    profileOf: profileOf, plan: plan, recommend: recommend, MIN_LINE_KG: MIN_LINE_KG,
    CHANGE_WINDOW_MONTHS: CHANGE_WINDOW_MONTHS, DEFAULT_LEAD_MONTHS: DEFAULT_LEAD_MONTHS, DEFAULT_EXCLUDED_WH: DEFAULT_EXCLUDED_WH, defaultPlanParams: defaultPlanParams, addMonths: addMonths,
  };
  root.SteelModel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
