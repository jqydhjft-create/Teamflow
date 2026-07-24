from __future__ import annotations

import re
from pathlib import Path
from xml.sax.saxutils import escape

import pdfplumber
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    KeepTogether,
    LongTable,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "codex-production-application-workflow-zh.md"
OUTPUT = ROOT / "output" / "pdf" / "codex-production-application-workflow-zh.pdf"
FONT_DIR = Path("C:/Windows/Fonts")
FONT_REGULAR = FONT_DIR / "Deng.ttf"
FONT_BOLD = FONT_DIR / "Dengb.ttf"
FONT_MONO = FONT_DIR / "consola.ttf"

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_X = 18 * mm
MARGIN_TOP = 18 * mm
MARGIN_BOTTOM = 17 * mm
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN_X

INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#667085")
BLUE = colors.HexColor("#2457D6")
LIGHT_BLUE = colors.HexColor("#EAF0FF")
LIGHT_GRAY = colors.HexColor("#F4F6F8")
MID_GRAY = colors.HexColor("#D7DDE5")
RISK = colors.HexColor("#B54708")


def register_fonts() -> None:
    missing = [path for path in (FONT_REGULAR, FONT_BOLD, FONT_MONO) if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Required font missing: {', '.join(map(str, missing))}")
    pdfmetrics.registerFont(TTFont("Deng", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("Deng-Bold", str(FONT_BOLD)))
    pdfmetrics.registerFont(TTFont("Consolas", str(FONT_MONO)))


def build_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Deng",
            fontSize=9.2,
            leading=14.2,
            textColor=INK,
            spaceAfter=5.5,
            wordWrap="CJK",
        ),
        "lead": ParagraphStyle(
            "Lead",
            parent=base["BodyText"],
            fontName="Deng",
            fontSize=11.2,
            leading=18,
            textColor=INK,
            alignment=TA_LEFT,
            spaceAfter=8,
            wordWrap="CJK",
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading1"],
            fontName="Deng-Bold",
            fontSize=18,
            leading=25,
            textColor=INK,
            spaceAfter=10,
            keepWithNext=True,
            wordWrap="CJK",
        ),
        "h3": ParagraphStyle(
            "H3",
            parent=base["Heading2"],
            fontName="Deng-Bold",
            fontSize=12.5,
            leading=18,
            textColor=BLUE,
            spaceBefore=8,
            spaceAfter=5,
            keepWithNext=True,
            wordWrap="CJK",
        ),
        "h4": ParagraphStyle(
            "H4",
            parent=base["Heading3"],
            fontName="Deng-Bold",
            fontSize=10.2,
            leading=15,
            textColor=INK,
            spaceBefore=6,
            spaceAfter=4,
            keepWithNext=True,
            wordWrap="CJK",
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName="Deng",
            fontSize=9,
            leading=13.8,
            leftIndent=12,
            firstLineIndent=-8,
            bulletIndent=2,
            textColor=INK,
            spaceAfter=2.5,
            wordWrap="CJK",
        ),
        "quote": ParagraphStyle(
            "Quote",
            parent=base["BodyText"],
            fontName="Deng",
            fontSize=9.2,
            leading=14.5,
            leftIndent=10,
            rightIndent=8,
            textColor=colors.HexColor("#344054"),
            backColor=LIGHT_BLUE,
            borderColor=BLUE,
            borderWidth=0,
            borderPadding=8,
            spaceBefore=4,
            spaceAfter=8,
            wordWrap="CJK",
        ),
        "code": ParagraphStyle(
            "Code",
            parent=base["Code"],
            fontName="Deng",
            fontSize=7.6,
            leading=11.2,
            textColor=colors.HexColor("#202938"),
            leftIndent=0,
            rightIndent=0,
            backColor=LIGHT_GRAY,
            borderColor=MID_GRAY,
            borderWidth=0.5,
            borderPadding=7,
            spaceBefore=2,
            spaceAfter=7,
            wordWrap="CJK",
        ),
        "table": ParagraphStyle(
            "TableCell",
            parent=base["BodyText"],
            fontName="Deng",
            fontSize=7.7,
            leading=11.2,
            textColor=INK,
            wordWrap="CJK",
        ),
        "table_head": ParagraphStyle(
            "TableHead",
            parent=base["BodyText"],
            fontName="Deng-Bold",
            fontSize=7.8,
            leading=11.4,
            textColor=colors.white,
            wordWrap="CJK",
        ),
        "toc_title": ParagraphStyle(
            "TOCTitle",
            parent=base["Heading1"],
            fontName="Deng-Bold",
            fontSize=22,
            leading=30,
            textColor=INK,
            spaceAfter=12,
        ),
    }


def inline_markup(text: str) -> str:
    safe = escape(text.strip())
    safe = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", safe)
    safe = re.sub(r"`([^`]+)`", r"<font name='Consolas' color='#2457D6'>\1</font>", safe)
    safe = re.sub(
        r"&lt;(https?://[^&]+)&gt;",
        r"<link href='\1' color='#2457D6'>\1</link>",
        safe,
    )
    return safe


def make_table(rows: list[list[str]], styles: dict[str, ParagraphStyle]) -> LongTable:
    width_count = max(len(row) for row in rows)
    normalized = [row + [""] * (width_count - len(row)) for row in rows]
    data: list[list[Paragraph]] = []
    for row_index, row in enumerate(normalized):
        style = styles["table_head"] if row_index == 0 else styles["table"]
        data.append([Paragraph(inline_markup(cell), style) for cell in row])

    if width_count == 2:
        widths = [CONTENT_WIDTH * 0.28, CONTENT_WIDTH * 0.72]
    elif width_count == 3:
        widths = [CONTENT_WIDTH * 0.20, CONTENT_WIDTH * 0.38, CONTENT_WIDTH * 0.42]
    elif width_count == 4:
        widths = [CONTENT_WIDTH * 0.18, CONTENT_WIDTH * 0.25, CONTENT_WIDTH * 0.29, CONTENT_WIDTH * 0.28]
    elif width_count == 5:
        widths = [CONTENT_WIDTH * 0.13, CONTENT_WIDTH * 0.20, CONTENT_WIDTH * 0.22, CONTENT_WIDTH * 0.23, CONTENT_WIDTH * 0.22]
    else:
        widths = [CONTENT_WIDTH / width_count] * width_count

    table = LongTable(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BLUE),
                ("GRID", (0, 0), (-1, -1), 0.35, MID_GRAY),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
            ]
        )
    )
    return table


def parse_markdown(source: str, styles: dict[str, ParagraphStyle]) -> list[object]:
    lines = source.splitlines()
    story: list[object] = []
    paragraph: list[str] = []
    code_lines: list[str] = []
    in_code = False
    table_rows: list[list[str]] = []
    top_level_seen = False
    skip_front_matter = True

    def flush_paragraph() -> None:
        if paragraph:
            story.append(Paragraph(inline_markup(" ".join(paragraph)), styles["body"]))
            paragraph.clear()

    def flush_code() -> None:
        if code_lines:
            rendered = "\n".join(code_lines)
            block = Preformatted(rendered, styles["code"], maxLineLength=82)
            story.append(block)
            code_lines.clear()

    def flush_table() -> None:
        if table_rows:
            if len(table_rows) >= 2 and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in table_rows[1]):
                table_rows.pop(1)
            story.extend([make_table(table_rows, styles), Spacer(1, 7)])
            table_rows.clear()

    for line in lines:
        stripped = line.strip()

        if skip_front_matter:
            if stripped == "---":
                skip_front_matter = False
            continue

        if stripped.startswith("```"):
            flush_paragraph()
            flush_table()
            if in_code:
                flush_code()
                in_code = False
            else:
                in_code = True
            continue

        if in_code:
            code_lines.append(line.rstrip())
            continue

        if stripped.startswith("|") and stripped.endswith("|"):
            flush_paragraph()
            table_rows.append([cell.strip() for cell in stripped.strip("|").split("|")])
            continue
        flush_table()

        if not stripped:
            flush_paragraph()
            continue

        if stripped == "---":
            flush_paragraph()
            story.append(Spacer(1, 3))
            story.append(HRFlowable(width="100%", thickness=0.6, color=MID_GRAY, spaceAfter=7))
            continue

        heading = re.match(r"^(#{2,4})\s+(.+)$", stripped)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            title = heading.group(2).strip()
            if level == 2:
                starts_major_part = bool(
                    re.match(r"^(1\.|8\.|12\.|16\.|附录 )", title)
                )
                if top_level_seen and starts_major_part:
                    story.append(PageBreak())
                top_level_seen = True
                story.append(Paragraph(inline_markup(title), styles["h2"]))
            elif level == 3:
                story.append(Paragraph(inline_markup(title), styles["h3"]))
            else:
                story.append(Paragraph(inline_markup(title), styles["h4"]))
            continue

        if stripped.startswith(">"):
            flush_paragraph()
            story.append(Paragraph(inline_markup(stripped.lstrip("> ")), styles["quote"]))
            continue

        bullet = re.match(r"^[-*]\s+(.*)$", stripped)
        ordered = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if bullet or ordered:
            flush_paragraph()
            marker = "□" if bullet and bullet.group(1).startswith("[ ]") else "•"
            body = bullet.group(1) if bullet else ordered.group(2)
            if body.startswith("[ ]"):
                body = body[3:].strip()
            if ordered:
                marker = f"{ordered.group(1)}."
            story.append(Paragraph(inline_markup(f"{marker} {body}"), styles["bullet"]))
            continue

        paragraph.append(stripped)

    flush_paragraph()
    flush_table()
    flush_code()
    return story


class HandbookDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str) -> None:
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=MARGIN_X,
            rightMargin=MARGIN_X,
            topMargin=MARGIN_TOP,
            bottomMargin=MARGIN_BOTTOM,
            title="使用 Codex 搭建生产级应用：完整工作流与实战技巧",
            author="OpenAI Codex",
            subject="技术栈中立的生产级应用交付工作流",
        )
        self.current_section = ""
        cover_frame = Frame(0, 0, PAGE_WIDTH, PAGE_HEIGHT, id="cover", showBoundary=0)
        body_frame = Frame(
            MARGIN_X,
            MARGIN_BOTTOM,
            CONTENT_WIDTH,
            PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM,
            id="body",
            showBoundary=0,
        )
        self.addPageTemplates(
            [
                PageTemplate(id="cover", frames=[cover_frame]),
                PageTemplate(id="body", frames=[body_frame], onPageEnd=self.draw_header_footer),
            ]
        )

    def beforeDocument(self) -> None:
        self.current_section = "目录"

    def afterFlowable(self, flowable: object) -> None:
        if not isinstance(flowable, Paragraph):
            return
        style_name = flowable.style.name
        if style_name != "H2":
            return
        level = 0
        title = flowable.getPlainText()
        key = f"heading-{level}-{self.seq.nextf('heading')}"
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(title, key, level=level, closed=False)
        self.notify("TOCEntry", (level, title, self.page, key))
        self.current_section = title

    def draw_header_footer(self, canvas, doc) -> None:  # type: ignore[no-untyped-def]
        canvas.saveState()
        page = canvas.getPageNumber()
        canvas.setStrokeColor(MID_GRAY)
        canvas.setLineWidth(0.45)
        canvas.line(MARGIN_X, PAGE_HEIGHT - 12 * mm, PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 12 * mm)
        canvas.setFont("Deng", 7.5)
        canvas.setFillColor(MUTED)
        header = self.current_section or "使用 Codex 搭建生产级应用"
        canvas.drawString(MARGIN_X, PAGE_HEIGHT - 9.5 * mm, header[:42])
        canvas.line(MARGIN_X, 11 * mm, PAGE_WIDTH - MARGIN_X, 11 * mm)
        canvas.drawString(MARGIN_X, 7.5 * mm, "Codex 生产级应用工作流 · 2026-07-10")
        canvas.drawRightString(PAGE_WIDTH - MARGIN_X, 7.5 * mm, f"{page}")
        canvas.restoreState()


def cover_story(styles: dict[str, ParagraphStyle]) -> list[object]:
    title = ParagraphStyle(
        "CoverTitle",
        fontName="Deng-Bold",
        fontSize=29,
        leading=41,
        textColor=INK,
        alignment=TA_LEFT,
        wordWrap="CJK",
    )
    subtitle = ParagraphStyle(
        "CoverSubtitle",
        fontName="Deng",
        fontSize=14,
        leading=23,
        textColor=BLUE,
        alignment=TA_LEFT,
        wordWrap="CJK",
    )
    meta = ParagraphStyle(
        "CoverMeta",
        fontName="Deng",
        fontSize=9.5,
        leading=16,
        textColor=MUTED,
        alignment=TA_LEFT,
        wordWrap="CJK",
    )
    ribbon = Table([[Paragraph("工程交付手册", styles["table_head"])]], colWidths=[35 * mm])
    ribbon.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), BLUE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return [
        Spacer(1, 40 * mm),
        ribbon,
        Spacer(1, 14 * mm),
        Paragraph("使用 Codex 搭建生产级应用", title),
        Spacer(1, 4 * mm),
        Paragraph("完整工作流与实战技巧", subtitle),
        Spacer(1, 10 * mm),
        HRFlowable(width="42%", thickness=2.2, color=BLUE, hAlign="LEFT"),
        Spacer(1, 12 * mm),
        Paragraph("从需求澄清、仓库调查、设计与计划，到测试、评审、发布、回滚和线上反馈的技术栈中立方法。", styles["lead"]),
        Spacer(1, 35 * mm),
        Paragraph("版本：2026-07-10", meta),
        Paragraph("适用对象：开发者、技术负责人和小型工程团队", meta),
        Paragraph("原则：让每个重要结论都有证据，让每个高风险动作都有边界。", meta),
        NextPageTemplate("body"),
        PageBreak(),
    ]


def build_pdf() -> tuple[Path, int, int]:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Manuscript not found: {SOURCE}")
    register_fonts()
    styles = build_styles()
    source = SOURCE.read_text(encoding="utf-8-sig")

    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(
            "TOCLevel0",
            fontName="Deng",
            fontSize=8.8,
            leading=12.1,
            leftIndent=0,
            firstLineIndent=0,
            textColor=INK,
            spaceBefore=0,
        ),
        ParagraphStyle(
            "TOCLevel1",
            fontName="Deng",
            fontSize=8.2,
            leading=12.5,
            leftIndent=12,
            firstLineIndent=0,
            textColor=MUTED,
            spaceBefore=1,
        ),
    ]

    story = cover_story(styles)
    story.extend(
        [
            Paragraph("目录", styles["toc_title"]),
            Paragraph("按生产交付生命周期组织；附录提供可以直接复用的模板与检查清单。", styles["body"]),
            Spacer(1, 5),
            toc,
            PageBreak(),
        ]
    )
    story.extend(parse_markdown(source, styles))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = HandbookDocTemplate(str(OUTPUT))
    doc.multiBuild(story)

    with pdfplumber.open(OUTPUT) as document:
        pages = len(document.pages)
    size = OUTPUT.stat().st_size
    return OUTPUT, pages, size


if __name__ == "__main__":
    path, pages, size = build_pdf()
    print(f"PDF: {path}")
    print(f"Pages: {pages}")
    print(f"Bytes: {size}")
