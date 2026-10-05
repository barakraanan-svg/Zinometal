#!/usr/bin/env python3
"""Builds the import order workbook from extract.js output.

    python3 steel-dashboard/order-file/build_order_file.py order.json "out.xlsx"

Sheets:
  טעינה                 one row per order line, literal values (what an importer reads)
  חישוב                 every SKU with live formulas from stock and consumption to the
                        quantity to order; parameters (arrival, until, minimum) at the top
  הזמנות פתוחות          open supplier lines the calculation sums
  סיכום לפי ספק          formulas over the load sheet
  לבדיקה לפני טעינה      lines whose supplier or price was inferred, or that a change to
                        an open order could cover
  שינוי הזמנות פתוחות     orders still inside the one-month change window
  רכש מקומי             what runs out before the import can land (not for loading)

Before saving, the calculation sheet's formulas are re-run in Python and compared with the
dashboard model; any difference stops the build. The workbook holds company data: write it
outside the repository.
"""
import datetime as dt
import json
import math
import sys

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.workbook.properties import CalcProperties

DAYS_PER_MONTH = 30.44
MAT = {"BLA": "שחור", "MEG": "מגולוון"}
F = "Arial"
FONT = Font(name=F, size=10)
BOLD = Font(name=F, size=10, bold=True)
BLUE = Font(name=F, size=10, color="0000FF")
GREEN = Font(name=F, size=10, color="008000")
TITLE = Font(name=F, size=13, bold=True)
HEAD_FILL = PatternFill("solid", fgColor="DDE3EA")
INPUT_FILL = PatternFill("solid", fgColor="FFFF00")
NOTE_FILL = PatternFill("solid", fgColor="FFF2CC")
ORDER_FILL = PatternFill("solid", fgColor="E2EFDA")
THIN = Side(style="thin", color="C9CFD6")
AUTHOR = "לוח ברזל מקצועי"


def iso(s):
    return dt.date(int(s[:4]), int(s[5:7]), int(s[8:10])) if s else None


def ym15(ym):
    return dt.date(int(ym[:4]), int(ym[5:7]), 15)


def header(ws, row, names, widths=None):
    for i, name in enumerate(names, start=1):
        c = ws.cell(row, i, name)
        c.font = BOLD
        c.fill = HEAD_FILL
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = Border(bottom=THIN)
        if widths:
            ws.column_dimensions[c.column_letter].width = widths[i - 1]


def new_sheet(wb, title):
    ws = wb.create_sheet(title)
    ws.sheet_view.rightToLeft = True
    return ws


def build(data, out_path):
    p = data["params"]
    ref = iso(data["refDate"])
    rows = data["rows"]
    lines = data["openLines"]
    wb = Workbook()
    wb.remove(wb.active)
    ws = new_sheet(wb, "טעינה")
    ss = new_sheet(wb, "סיכום לפי ספק")
    cs = new_sheet(wb, "חישוב")
    ps = new_sheet(wb, "פרמטרים")
    ol = new_sheet(wb, "הזמנות פתוחות")
    ck = new_sheet(wb, "לבדיקה לפני טעינה")
    sw = new_sheet(wb, "שינוי הזמנות פתוחות")
    ls = new_sheet(wb, "רכש מקומי (לא לטעינה)")

    # ---------- open lines (summed by the calculation) ----------
    header(ol, 1, ["הזמנה", "שם_ספק", "מקט", "ת_פריט", "יתרה ק\"ג", "הגעה צפויה", "תאריך הזמנה", "סטטוס", "אוניה"],
           [13, 34, 16, 28, 11, 11, 11, 10, 34])
    for l in sorted(lines, key=lambda l: (l["sku"], l["eta"] or "")):
        ol.append([l["po"], l["supplier"], l["sku"], l["desc"], l["kgOpen"], iso(l["eta"]), iso(l["orderDate"]),
                   l["status"], l["ship"]])
    ol_last = max(len(lines) + 1, 2)
    for r in ol.iter_rows(min_row=2):
        for c in r:
            c.font = FONT
        r[4].number_format = "#,##0"
        r[5].number_format = r[6].number_format = "DD/MM/YY"
    ol.freeze_panes = "A2"
    ol.auto_filter.ref = "A1:I%d" % ol_last

    # ---------- calculation ----------
    ps["A1"] = "פרמטרים של גיליון החישוב"
    ps["A1"].font = TITLE
    ps["A2"], ps["B2"] = "תאריך ייחוס (דוח המלאי)", ref
    ps["B2"].number_format = "DD/MM/YY"
    ps.column_dimensions["A"].width = 40
    ps.column_dimensions["B"].width = 12
    ps.column_dimensions["C"].width = 12
    for col, name in (("A", "פרמטר"), ("B", "שחור"), ("C", "מגולוון")):
        ps[col + "3"] = name
        ps[col + "3"].font = BOLD
        ps[col + "3"].fill = HEAD_FILL
    params = [
        ("זמן אספקה (חודשים, לידיעה)", data["leadMonths"], data["leadMonths"], "0", False),
        ("הגעה (15 בחודש)", ym15(p["BLA"]["arrival"]), ym15(p["MEG"]["arrival"]), "DD/MM/YY", True),
        ("ההזמנה מחזיקה עד", ym15(p["BLA"]["until"]), ym15(p["MEG"]["until"]), "DD/MM/YY", True),
        ("חודשים עד ההגעה", "=(B5-$B$2)/%s" % DAYS_PER_MONTH, "=(C5-$B$2)/%s" % DAYS_PER_MONTH, "0.00", False),
        ("חודשים מההגעה עד היעד", "=(B6-B5)/%s" % DAYS_PER_MONTH, "=(C6-C5)/%s" % DAYS_PER_MONTH, "0.00", False),
        ("מינימום לשורה ק\"ג", p["BLA"].get("minKg", data["minKg"]), p["MEG"].get("minKg", data["minKg"]), "#,##0", True),
        ("עיגול לכפולות ק\"ג", p["BLA"]["stepKg"], p["MEG"]["stepKg"], "#,##0", True),
        ("סף להזמנה ק\"ג (צורך קטן מזה לא מוזמן)", "=B9/2", "=C9/2", "#,##0", False),
    ]
    for i, (name, b, c, fmt, editable) in enumerate(params, start=4):
        ps.cell(i, 1, name).font = FONT
        for col, v in ((2, b), (3, c)):
            cell = ps.cell(i, col, v)
            cell.number_format = fmt
            cell.font = BLUE if editable else FONT
            if editable:
                cell.fill = INPUT_FILL
    legend = [
        "צהוב = אפשר לשנות, וגיליון החישוב מתעדכן. כחול = נתון מהדוחות. שחור = נוסחה.",
        "בגיליון החישוב השורות של אותו פרופיל רצופות, מהאורך הארוך לקצר.",
        "עודף באורך ארוך עובר לאורך הקצר (חיתוך), לא להפך. צורך של 6.05 מ׳ עובר לשורת 12.1 מ׳.",
        "גיליון הטעינה לא מתעדכן מכאן: הוא תמונה של הכמויות בזמן ההפקה.",
    ]
    for i, text in enumerate(legend, start=13):
        ps.cell(i, 1, text).font = FONT

    H = ["מקט", "תיאור", "פרופיל", "חומר", "אורך מ׳", "פעיל", "מלאי ק\"ג", "צריכה חודשית ק\"ג", "חודשי מלאי",
         "בדרך עד ההגעה ק\"ג", "בדרך אחרי ההגעה עד היעד ק\"ג", "עודף מאורך ארוך, בהגעה", "עודף מאורך ארוך, אחרי ההגעה",
         "חודשים עד ההגעה", "צריכה עד ההגעה", "חוסר עד ההגעה (רכש מקומי)", "מלאי צפוי בהגעה",
         "חודשים בתקופה", "צריכה בתקופה", "צורך עצמי ליבוא", "העברת 6.05 ל-12.1", "צורך ליבוא",
         "להזמנה לפי החישוב ק\"ג", "בקובץ הטעינה ק\"ג", "מחיר $ לטון", "סכום לפי החישוב $", "ספק מוצע",
         "6.05 (נחתך)", "יעד חיתוך", "עודף לאורך הקצר", "מתוכו בהגעה", "מתוכו אחרי ההגעה", "הערות"]
    W = [16, 28, 13, 8, 7, 6, 10, 11, 8, 11, 12, 11, 11, 8, 10, 12, 10, 8, 10, 10, 10, 10, 11, 11, 9, 11, 30,
         8, 8, 10, 10, 10, 40]
    hr = 1
    header(cs, hr, H, W)
    cs.row_dimensions[hr].height = 45
    first = hr + 1
    last = hr + len(rows)
    olr = "'הזמנות פתוחות'!$%s$2:$%s$" + str(ol_last)

    def mp(row, b, c):  # per-material parameter from the parameters sheet
        return "IF($D{r}=\"שחור\",'פרמטרים'!{b},'פרמטרים'!{c})".format(r=row, b=b, c=c)

    for i, x in enumerate(rows):
        r = first + i
        notes = []
        if x["half"]:
            notes.append("6.05 נחתך מ-12.1, הצורך עובר לשורת 12.1")
        if x["swap"]:
            notes.append("אפשר לכסות בשינוי הזמנה: " + ", ".join(x["swap"]))
        if x["overridden"]:
            notes.append("הכמות שונתה בטיוטה")
        vals = {
            "A": x["sku"], "B": x["desc"], "C": x["profile"], "D": MAT.get(x["material"], x["material"]),
            "E": x["lengthM"] or "", "F": "כן" if x["active"] else "לא",
            "G": round(x["stockKg"], 1), "H": round(x["cons"], 2),
            "I": "=IF(H{r}>0,MAX(G{r},0)/H{r},\"\")",
            "J": "=SUMIFS(%s,%s,$A{r},%s,\"<=\"&%s)" % (olr % ("E", "E"), olr % ("C", "C"), olr % ("F", "F"), mp(r, "$B$5", "$C$5")),
            "K": "=SUMIFS(%s,%s,$A{r},%s,\">\"&%s,%s,\"<=\"&%s)" % (olr % ("E", "E"), olr % ("C", "C"), olr % ("F", "F"),
                                                                  mp(r, "$B$5", "$C$5"), olr % ("F", "F"), mp(r, "$B$6", "$C$6")),
            "L": "=IF($C{r}=$C{p},AE{p},0)", "M": "=IF($C{r}=$C{p},AF{p},0)",
            "N": "=" + mp(r, "$B$7", "$C$7"),
            "O": "=H{r}*N{r}",
            "P": "=IF(F{r}=\"כן\",MAX(0,O{r}-(G{r}+J{r}+L{r})),0)",
            "Q": "=MAX(0,G{r}+J{r}+L{r}-O{r})",
            "R": "=" + mp(r, "$B$8", "$C$8"),
            "S": "=H{r}*R{r}",
            "T": "=IF(F{r}=\"כן\",MAX(0,S{r}-Q{r}-K{r}-M{r}),0)",
            "U": "=IF(AB{r}=\"כן\",-T{r},IF(AC{r}=\"כן\",SUMIFS($T$%d:$T$%d,$C$%d:$C$%d,$C{r},$AB$%d:$AB$%d,\"כן\"),0))"
                 % (first, last, first, last, first, last),
            "V": "=T{r}+U{r}",
            "W": "=IF(V{r}<%s,0,MAX(%s,CEILING(V{r},%s)))" % (mp(r, "$B$11", "$C$11"), mp(r, "$B$9", "$C$9"), mp(r, "$B$10", "$C$10")),
            "X": x["qtyKg"],
            "Y": round(x["price"]) if x["price"] else "",
            "Z": "=IF(Y{r}=\"\",\"\",W{r}/1000*Y{r})",
            "AA": x["supplier"] or "",
            "AB": "כן" if x["half"] else "", "AC": "כן" if x["cutTarget"] else "",
            "AD": "=MAX(0,Q{r}+K{r}+M{r}-S{r})", "AE": "=MIN(AD{r},Q{r})", "AF": "=AD{r}-AE{r}",
            "AG": "; ".join(notes),
        }
        for col, v in vals.items():
            if isinstance(v, str) and v.startswith("="):
                v = v.replace("{r}", str(r)).replace("{p}", str(r - 1))
            cell = cs["%s%d" % (col, r)]
            cell.value = v
            cell.font = BLUE if col in ("G", "H", "X", "Y") else FONT
        for col, fmt in (("G", "#,##0"), ("H", "#,##0"), ("I", "0.0"), ("J", "#,##0"), ("K", "#,##0"),
                         ("L", "#,##0"), ("M", "#,##0"), ("N", "0.00"), ("O", "#,##0"), ("P", "#,##0"),
                         ("Q", "#,##0"), ("R", "0.00"), ("S", "#,##0"), ("T", "#,##0"), ("U", "#,##0"),
                         ("V", "#,##0"), ("W", "#,##0"), ("X", "#,##0"), ("Y", "#,##0"), ("Z", "$#,##0"),
                         ("AD", "#,##0"), ("AE", "#,##0"), ("AF", "#,##0")):
            cs["%s%d" % (col, r)].number_format = fmt
        if x["qtyKg"] > 0:
            for col in ("A", "W", "X"):
                cs["%s%d" % (col, r)].fill = ORDER_FILL
    cs.freeze_panes = cs["B%d" % first]
    cs.auto_filter.ref = "A%d:AG%d" % (hr, last)
    notes_col = {"W": "מינימום לשורה, מעוגל למעלה לכפולות; 0 אם הצורך קטן מהסף (גיליון פרמטרים).",
                 "P": "מה שייגמר לפני שהיבוא יכול להגיע: צריכה עד ההגעה פחות מלאי, בדרך ועודף מאורך ארוך.",
                 "T": "צריכה בתקופה פחות מלאי צפוי בהגעה, בדרך אחרי ההגעה ועודף מאורך ארוך.",
                 "L": "עודף של האורך הארוך יותר באותו פרופיל (השורה שמעל), שאפשר לחתוך לאורך הזה.",
                 "X": "הכמות שנכנסה לגיליון הטעינה: מהחישוב, או מהטיוטה אם שונתה שם."}
    for col, text in notes_col.items():
        cs["%s%d" % (col, hr)].comment = Comment(text, AUTHOR)

    # ---------- self-check: re-run the formulas in Python and compare with the model ----------
    def toA(m):
        return (ym15(p[m]["arrival"]) - ref).days / DAYS_PER_MONTH

    def span(m):
        return (ym15(p[m]["until"]) - ym15(p[m]["arrival"])).days / DAYS_PER_MONTH

    def in_window(sku, lo, hi):
        return sum(l["kgOpen"] for l in lines if l["sku"] == sku and l["eta"] and
                   (lo is None or iso(l["eta"]) > lo) and iso(l["eta"]) <= hi)

    sim = []
    prev = None
    for x in rows:
        m = x["material"]
        A, C = ym15(p[m]["arrival"]), ym15(p[m]["until"])
        g, h = x["stockKg"], x["cons"]
        j, k = in_window(x["sku"], None, A), in_window(x["sku"], A, C)
        same = prev is not None and prev["profile"] == x["profile"]
        l_, m_ = (prev["carryA"], prev["carryC"]) if same else (0, 0)
        o = h * toA(m)
        loc = max(0, o - (g + j + l_)) if x["active"] else 0
        q = max(0, g + j + l_ - o)
        s = h * span(m)
        t = max(0, s - q - k - m_) if x["active"] else 0
        ad = max(0, q + k + m_ - s)
        ae = min(ad, q)
        cur = {"profile": x["profile"], "half": x["half"], "cutTarget": x["cutTarget"], "t": t, "local": loc,
               "carryA": ae, "carryC": ad - ae, "material": m}
        sim.append(cur)
        prev = cur
    for c in sim:
        if c["half"]:
            c["u"] = -c["t"]
        elif c["cutTarget"]:
            c["u"] = sum(o["t"] for o in sim if o["profile"] == c["profile"] and o["half"])
        else:
            c["u"] = 0
        v = c["t"] + c["u"]
        mn, step = p[c["material"]].get("minKg", data["minKg"]), p[c["material"]]["stepKg"]
        c["w"] = 0 if v < mn / 2 else max(mn, math.ceil(v / step) * step)
    bad = [(x["sku"], s["w"], x["check"]["rec"], s["local"], x["check"]["local"]) for x, s in zip(rows, sim)
           if abs(s["w"] - x["check"]["rec"]) > 0.5 or abs(s["local"] - x["check"]["local"]) > 1]
    if bad:
        for b in bad[:20]:
            print("  mismatch", b)
        raise SystemExit("calculation sheet does not match the dashboard model: %d rows" % len(bad))

    # ---------- load sheet: literal values, one row per order line ----------
    HL = ["מס_ספק", "שם_ספק", "מטבע", "תא_הז", "ת_אספקה", "מקט", "ת_פריט", "כמות", "יחידה", "מחיר_יח", "מחיר_לטון",
          "סך_מחיר", "הערות"]
    header(ws, 1, HL, [11, 36, 7, 10, 10, 16, 30, 10, 7, 10, 11, 12, 46])
    ws.freeze_panes = "A2"
    order = sorted([x for x in rows if x["qtyKg"] > 0], key=lambda x: (x["supplier"] or "", x["material"], x["family"], x["sku"]))
    for n, x in enumerate(order, start=2):
        unit = round(x["price"] / 1000, 3) if x["price"] else 0
        notes = []
        if x["supplierSrc"] != "sku":
            notes.append("ספק לפי המשפחה")
        if x["priceSrc"] != "sku":
            notes.append("מחיר לפי ממוצע המשפחה")
        if x["swap"]:
            notes.append("אפשר לכסות בשינוי הזמנה: " + ", ".join(x["swap"]))
        ws.append([x["supplierNo"], x["supplier"], "$", ref, ym15(p[x["material"]]["arrival"]), x["sku"], x["desc"],
                   x["qtyKg"], "ק'ג", unit, round(x["price"]) if x["price"] else "", round(x["qtyKg"] * unit, 2),
                   "; ".join(notes)])
        for c in ws[n]:
            c.font = FONT
        for col in ("A", "B", "H", "K"):
            ws["%s%d" % (col, n)].font = BLUE
        ws["D%d" % n].number_format = ws["E%d" % n].number_format = "DD/MM/YY"
        ws["H%d" % n].number_format = ws["K%d" % n].number_format = ws["L%d" % n].number_format = "#,##0"
        ws["J%d" % n].number_format = "0.000"
        if notes:
            ws["M%d" % n].fill = NOTE_FILL
    load_last = max(len(order) + 1, 2)
    ws["H1"].comment = Comment("כמות בק\"ג. איך חושבה: גיליון \"חישוב\", עמודה W.", AUTHOR)
    ws["J1"].comment = Comment("דולר לק\"ג. ערכים קבועים כדי שהטעינה תקרא מספרים; בשינוי כמות או מחיר יש לעדכן גם את סך_מחיר.", AUTHOR)
    ws["E1"].comment = Comment("הגעה מבוקשת: 15 בחודש ההגעה (זמן אספקה %s חודשים)." % data["leadMonths"], AUTHOR)

    # ---------- summary per supplier ----------
    header(ss, 1, ["מס_ספק", "שם_ספק", "שורות", "טון", "סך_מחיר $", "ממוצע $ לטון"], [11, 40, 8, 10, 13, 13])
    sups = []
    for x in order:
        if (x["supplierNo"], x["supplier"]) not in sups:
            sups.append((x["supplierNo"], x["supplier"]))
    rng = "'טעינה'!$%s$2:$%s$" + str(load_last)
    for i, (no, name) in enumerate(sups, start=2):
        ss.append([no, name, "=COUNTIF(%s,B%d)" % (rng % ("B", "B"), i),
                   "=SUMIF(%s,B%d,%s)/1000" % (rng % ("B", "B"), i, rng % ("H", "H")),
                   "=SUMIF(%s,B%d,%s)" % (rng % ("B", "B"), i, rng % ("L", "L")),
                   "=IF(D%d=0,0,E%d/D%d)" % (i, i, i)])
        for c in ss[i]:
            c.font = GREEN if c.column in (3, 4, 5) else FONT
    t = len(sups) + 2
    ss.append(["", "סה״כ", "=SUM(C2:C%d)" % (t - 1), "=SUM(D2:D%d)" % (t - 1), "=SUM(E2:E%d)" % (t - 1),
               "=IF(D%d=0,0,E%d/D%d)" % (t, t, t)])
    for c in ss[t]:
        c.font = BOLD
        c.border = Border(top=THIN)
    for r in range(2, t + 1):
        ss["D%d" % r].number_format = "#,##0.0"
        ss["E%d" % r].number_format = ss["F%d" % r].number_format = "$#,##0"
    dr = data.get("draft")
    info = [
        ("נתונים", "מלאי %s, הזמנות ספק %s. מחסנים %s לא נספרים." % (data["stockRun"], data["ordersRun"], ", ".join(data["excludedWh"]))),
        ("מקור הכמויות", "טיוטה מ-%s, %d כמויות שונו ידנית." % (dr["savedAt"][:16].replace("T", " "), dr["overrides"]) if dr
         else "המלצות הלוח, בלי טיוטה."),
        ("זמן אספקה", "%s חודשים מהזמנה להגעה, שחור ומגולוון." % data["leadMonths"]),
        ("הגעה ויעד", "; ".join("%s: הגעה %s, מחזיק עד %s" % (MAT[m], ym15(p[m]["arrival"]).strftime("%d/%m/%y"),
                                                              ym15(p[m]["until"]).strftime("%m/%Y")) for m in ("BLA", "MEG"))),
        ("כמות לשורה", "מינימום 5 טון, מעוגל למעלה לכפולות; צורך קטן מ-2.5 טון לא הוזמן (אפשר לשנות בגיליון פרמטרים)."),
        ("איך חושב", "גיליון \"חישוב\": כל מק\"ט, מהמלאי והצריכה עד הכמות."),
        ("ספק", "הספק האחרון של המק\"ט בהזמנות הפתוחות; אם אין, הספק עם הכי הרבה טון באותה משפחה וחומר."),
        ("שינוי הזמנות", "הזמנה אפשר לשנות רק בחודש הראשון. אם ספק מאשר שינוי (גיליון \"שינוי הזמנות פתוחות\"), להוריד מכאן את אותן כמויות."),
    ]
    r0 = t + 2
    for i, (k, v) in enumerate(info):
        ss.cell(r0 + i, 1, k).font = BOLD
        ss.cell(r0 + i, 2, v).font = FONT
        ss.cell(r0 + i, 2).alignment = Alignment(wrap_text=True, vertical="top")

    # ---------- lines to check ----------
    header(ck, 1, ["מקט", "ת_פריט", "שם_ספק", "טון", "מה לבדוק"], [16, 30, 36, 8, 70])
    for x in order:
        why = []
        if x["supplierSrc"] != "sku":
            why.append("הספק נבחר לפי המשפחה, המק\"ט לא בהזמנות הפתוחות אצלו")
        if x["priceSrc"] != "sku":
            why.append("המחיר הוא ממוצע המשפחה")
        if x["swap"]:
            why.append("אפשר לכסות בשינוי " + ", ".join(x["swap"]))
        if why:
            ck.append([x["sku"], x["desc"], x["supplier"], x["qtyKg"] / 1000, "; ".join(why)])
    for r in ck.iter_rows(min_row=2):
        for c in r:
            c.font = FONT
        r[3].number_format = "#,##0.0"

    # ---------- orders that can still change ----------
    header(sw, 1, ["הזמנה", "שם_ספק", "הוזמנה", "ניתן לשנות עד", "מצב", "טון", "להקטין: מקט", "טון", "חודשי מלאי",
                   "להמיר ל: מקט", "חוסר עד ההגעה ק\"ג", "צורך ליבוא ק\"ג"],
           [13, 34, 10, 12, 22, 8, 16, 7, 9, 16, 12, 12])
    state = {"open": "ניתן לשנות", "locked": "נעולה, עבר חודש"}
    for s in data["swaps"]:
        n = max(len(s["lines"]), len(s["candidates"]), 1) if s["state"] == "open" else 1
        for i in range(n):
            ln = s["lines"][i] if s["state"] == "open" and i < len(s["lines"]) else None
            cd = s["candidates"][i] if s["state"] == "open" and i < len(s["candidates"]) else None
            sw.append([s["po"] if i == 0 else "", s["supplier"] if i == 0 else "", iso(s["orderDate"]) if i == 0 else None,
                       iso(s["changeUntil"]) if i == 0 else None, state[s["state"]] if i == 0 else "",
                       s["kg"] / 1000 if i == 0 else None,
                       ln["sku"] if ln else "", ln["kg"] / 1000 if ln else None,
                       (round(ln["coverage"], 1) if ln["cons"] > 0 else "בלי צריכה") if ln else None,
                       cd["sku"] if cd else "", round(cd["local"]) if cd else None, cd["rec"] if cd else None])
    for r in sw.iter_rows(min_row=2):
        for c in r:
            c.font = FONT
        r[2].number_format = r[3].number_format = "DD/MM/YY"
        r[10].number_format = r[11].number_format = "#,##0"

    # ---------- local bridge ----------
    header(ls, 1, ["מקט", "ת_פריט", "חומר", "מלאי ק\"ג", "צריכה לחודש ק\"ג", "נגמר בערך", "הגעה קרובה", "חוסר עד ההגעה ק\"ג"],
           [16, 30, 9, 11, 12, 11, 11, 14])
    for x in data["local"]:
        ls.append([x["sku"], x["desc"], MAT.get(x["material"], x["material"]), round(x["stockKg"]), round(x["cons"]),
                   iso(x["runOut"]) if x["runOut"] else "אזל", iso(x["nextEta"]), round(x["localKg"])])
    for r in ls.iter_rows(min_row=2):
        for c in r:
            c.font = FONT
        for k in (3, 4, 7):
            r[k].number_format = "#,##0"
        r[5].number_format = r[6].number_format = "DD/MM/YY"

    wb.active = 0
    wb.calculation = CalcProperties(fullCalcOnLoad=True)
    wb.save(out_path)
    print("saved %s: %d order lines, %d t, calculation sheet %d rows, formulas match the model"
          % (out_path, len(order), sum(x["qtyKg"] for x in order) / 1000, len(rows)))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    build(json.load(open(sys.argv[1], encoding="utf-8")), sys.argv[2])
