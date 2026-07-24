# Codex Production Workflow Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a polished Chinese PDF that teaches a technology-neutral, production-grade Codex application delivery workflow with reusable prompts, decision gates, failure corrections, and release checklists.

**Architecture:** Maintain the handbook as a structured Markdown source, then use one focused ReportLab build script to convert the content into an A4 PDF with repeatable styles, tables, callout boxes, headers, footers, and a table of contents. Verify facts against the current official Codex manual, verify text with `pypdf` or `pdfplumber`, and verify layout by rendering every page with Poppler and inspecting the resulting PNGs.

**Tech Stack:** Markdown, Python 3, ReportLab, pypdf/pdfplumber, Poppler (`pdfinfo`, `pdftoppm`)

---

## File Structure

- Create: `docs/codex-production-application-workflow-zh.md` - authoritative Chinese manuscript and references.
- Create: `tools/build_codex_workflow_pdf.py` - deterministic Markdown-to-PDF builder and document styles.
- Create: `tests/test_codex_workflow_pdf.py` - smallest runnable structural check for the generated PDF.
- Create: `output/pdf/codex-production-application-workflow-zh.pdf` - final PDF artifact.
- Create during verification: `tmp/pdfs/codex-workflow-page-*.png` - rendered page images for visual QA; remove after final verification.
- Use as source: `%TEMP%/openai-docs-cache/codex-manual.md` and `%TEMP%/openai-docs-cache/codex-manual.outline.md` - current official Codex manual cache produced by the OpenAI docs helper.

### Task 1: Acquire And Bound The Official Codex Source Material

**Files:**
- Read: `C:/Users/Administrator/.codex/skills/.system/openai-docs/scripts/fetch-codex-manual.mjs`
- Generate outside repository: `%TEMP%/openai-docs-cache/codex-manual.md`
- Generate outside repository: `%TEMP%/openai-docs-cache/codex-manual.outline.md`
- Create: `docs/codex-production-application-workflow-zh.md`

- [ ] **Step 1: Fetch the current official Codex manual**

Run:

```powershell
node C:\Users\Administrator\.codex\skills\.system\openai-docs\scripts\fetch-codex-manual.mjs
```

Expected: exit code `0`, with output naming readable `codex-manual.md` and `codex-manual.outline.md` cache paths.

- [ ] **Step 2: Locate the exact manual sections needed by the handbook**

Search the outline and manual for these official concepts:

```text
AGENTS.md
config.toml
skills
plugins
MCP
hooks
automations
sandbox
approvals
Codex app
CLI
IDE extension
cloud
browser
```

Run:

```powershell
Select-String -Path "$env:TEMP\openai-docs-cache\codex-manual*.md" -Pattern 'AGENTS\.md|config\.toml|skills|plugins|MCP|hooks|automations|sandbox|approvals|Codex app|CLI|IDE extension|cloud|browser' -CaseSensitive:$false
```

Expected: every product concept used as a confirmed fact in the manuscript has at least one identifiable official section. If a term is absent, use the closest documented term and do not present the absent term as an official capability.

- [ ] **Step 3: Create the manuscript shell with explicit source boundaries**

Create `docs/codex-production-application-workflow-zh.md` with this exact top-level structure:

```markdown
# 使用 Codex 搭建生产级应用：完整工作流与实战技巧

> 版本：2026-07-10
> 定位：技术栈中立的工程交付手册

## 阅读指南
## 1. 生产级交付不是“让 AI 写完代码”
## 2. 四个控制变量：上下文、约束、反馈、验证
## 3. 根据风险选择流程强度
## 4. 阶段一：定义目标、边界与成功条件
## 5. 阶段二：准备仓库、环境与持久指令
## 6. 阶段三：调查现状并建立证据
## 7. 阶段四：比较方案并确认设计
## 8. 阶段五：制定可执行计划
## 9. 阶段六：用测试和检查约束实现
## 10. 阶段七：小批次修改与持续验证
## 11. 阶段八：系统调试、回归与浏览器验收
## 12. 阶段九：安全、数据、性能与可运维性审查
## 13. 阶段十：代码评审与合并决策
## 14. 阶段十一：CI/CD、发布、迁移与回滚
## 15. 阶段十二：监控、事故反馈与知识沉淀
## 16. Codex 工作表面应该如何选择
## 17. 高效使用 Codex 的工作技巧
## 18. 高频失败模式与纠偏方法
## 19. 可复制的提示词模板
## 附录 A：一页式端到端工作流
## 附录 B：生产就绪检查清单
## 附录 C：AGENTS.md 通用模板
## 附录 D：能力选择速查表
## 附录 E：术语与官方参考资料
```

Immediately below the reading guide, state that official Codex product facts come from OpenAI sources while software engineering recommendations are the handbook author's synthesis.

- [ ] **Step 4: Verify the manuscript shell and source boundary**

Run:

```powershell
Select-String -LiteralPath docs\codex-production-application-workflow-zh.md -Pattern '^## '
Select-String -LiteralPath docs\codex-production-application-workflow-zh.md -Pattern 'OpenAI|官方|工程建议'
```

Expected: all 25 planned top-level sections appear, and the official-fact/engineering-guidance boundary is explicit.

### Task 2: Write The Complete Technology-Neutral Manuscript

**Files:**
- Modify: `docs/codex-production-application-workflow-zh.md`

- [ ] **Step 1: Write the core delivery model**

Sections 1 through 3 must define:

- the difference between code generation and production delivery;
- the human's non-delegable responsibilities: product intent, risk acceptance, credentials, destructive actions, compliance, merge, and release decisions;
- the smallest trustworthy loop: investigate -> plan -> change -> verify -> review;
- the four control variables: context, constraints, feedback, and verification;
- three risk levels: low-risk local change, medium-risk cross-component change, and high-risk security/data/release change;
- how workflow intensity increases with blast radius, irreversibility, uncertainty, and external impact.

Include one compact risk matrix with columns `Risk level`, `Typical task`, `Required planning`, `Required verification`, and `Human gate`.

- [ ] **Step 2: Write all twelve workflow stages using one stable schema**

For each stage, include these exact subheadings:

```markdown
### 目标
### 给 Codex 的输入
### Codex 应执行的动作
### 人类决策点
### 必须形成的产物
### 退出条件
### 推荐提示词
```

Each stage must include at least one observable exit condition. Examples include an approved acceptance-criteria list, a saved design, a runnable verification command, zero unresolved high-severity review findings, or a tested rollback path.

- [ ] **Step 3: Write the Codex surface-selection section from official evidence**

Explain the smallest durable surface that matches each scope:

| Need | Preferred surface |
|---|---|
| One task or one thread | Prompt/thread context |
| Repository conventions and verification commands | `AGENTS.md` |
| Trusted repository settings | Project `.codex/config.toml` |
| Personal cross-repository defaults | Global config/guidance |
| Reusable workflow | Skill |
| Installable bundle of workflows and tools | Plugin |
| Live external data or actions | MCP server or connector |
| Mechanical lifecycle enforcement | Hook |
| Scheduled or follow-up work | Automation |

Also compare CLI, IDE extension, Codex app, cloud work, in-app browser, Chrome-attached automation, and desktop/computer control only where those surfaces are established by the official source available during execution.

- [ ] **Step 4: Write at least twenty concrete working tips**

The tips must cover these categories without repeating the main workflow:

- prompt construction;
- context budgeting;
- file and task sizing;
- command and evidence discipline;
- interruption recovery;
- dealing with dirty worktrees;
- dependency restraint;
- secret handling;
- database migration safety;
- browser and UI verification;
- code review communication;
- knowing when to start a fresh thread.

Each tip must contain an action and a reason, not a slogan.

- [ ] **Step 5: Write at least fifteen failure modes with corrections**

Use a four-column table or repeated callout schema with `Symptom`, `Root cause`, `Correction`, and `Prevention`. Include, at minimum:

```text
asking for the whole application in one prompt
starting implementation before repository investigation
unclear acceptance criteria
context dumping
large unreviewable diffs
model-reported success without command evidence
partial test extrapolation
symptom patching without root-cause analysis
premature abstraction
unbounded dependency upgrades
secrets in prompts or logs
unsafe destructive commands
irreversible database migrations
UI changes without browser verification
release without rollback rehearsal
```

- [ ] **Step 6: Write reusable prompt and checklist appendices**

Include copyable templates for:

- repository reconnaissance;
- requirement clarification;
- design alternatives;
- implementation planning;
- feature implementation;
- systematic debugging;
- security review;
- code review;
- release readiness;
- interrupted-session handoff.

Every template must contain fields for objective, context, scope, constraints, verification commands, forbidden actions, and output format. Add a compact `AGENTS.md` template containing repository overview, commands, conventions, test expectations, security boundaries, and definition of done.

- [ ] **Step 7: Run the manuscript completeness check**

Run:

```powershell
$p='docs\codex-production-application-workflow-zh.md'
$required=@('调查','计划','测试','验证','安全','评审','CI/CD','发布','回滚','监控','AGENTS.md','config.toml','Skill','MCP','Hook','Automation','提示词','失败模式','检查清单')
$missing=$required | Where-Object { -not (Select-String -LiteralPath $p -SimpleMatch $_ -Quiet) }
if ($missing) { throw "Missing required topics: $($missing -join ', ')" }
(Get-Content -Raw -LiteralPath $p).Length
```

Expected: no missing-topic exception; manuscript character count is at least `30000` so the handbook is substantive enough for the planned page count.

### Task 3: Build The PDF Generator With A Minimal Automated Check

**Files:**
- Create: `tests/test_codex_workflow_pdf.py`
- Create: `tools/build_codex_workflow_pdf.py`
- Create: `output/pdf/codex-production-application-workflow-zh.pdf`

- [ ] **Step 1: Write the failing structural test**

Create `tests/test_codex_workflow_pdf.py`:

```python
from pathlib import Path

from pypdf import PdfReader


PDF = Path("output/pdf/codex-production-application-workflow-zh.pdf")


def test_generated_handbook_is_structurally_complete() -> None:
    assert PDF.exists()
    assert PDF.stat().st_size > 100_000

    reader = PdfReader(PDF)
    assert 25 <= len(reader.pages) <= 50

    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    for phrase in (
        "生产级交付",
        "端到端工作流",
        "AGENTS.md",
        "安全",
        "回滚",
        "生产就绪检查清单",
        "官方参考资料",
    ):
        assert phrase in text
```

- [ ] **Step 2: Run the test to confirm it fails before generation**

Run:

```powershell
python -m pytest tests\test_codex_workflow_pdf.py -v
```

Expected: FAIL because the final PDF does not yet exist.

- [ ] **Step 3: Implement the smallest maintainable ReportLab builder**

Create `tools/build_codex_workflow_pdf.py` with these responsibilities:

```text
1. Register one available Chinese sans-serif font and one monospace font.
2. Parse Markdown headings, paragraphs, bullets, fenced code, block quotes, and simple pipe tables.
3. Build an A4 document with a cover, generated table of contents, body styles, callout styles, headers, footers, and page numbers.
4. Keep headings with their first body block and allow long tables to repeat header rows.
5. Write only to output/pdf/codex-production-application-workflow-zh.pdf.
6. Fail with a clear error when the manuscript or required font is missing.
```

Use ReportLab's existing `BaseDocTemplate`, `PageTemplate`, `Paragraph`, `Table`, `LongTable`, `KeepTogether`, `PageBreak`, and `TableOfContents`; do not add a general Markdown dependency.

- [ ] **Step 4: Generate the PDF**

Run:

```powershell
python tools\build_codex_workflow_pdf.py
```

Expected: exit code `0`; the command prints the absolute output path, file size, and page count.

- [ ] **Step 5: Run the structural test and fix generation defects**

Run:

```powershell
python -m pytest tests\test_codex_workflow_pdf.py -v
```

Expected: `1 passed`, confirming file existence, nontrivial size, page-count range, and required extracted phrases.

### Task 4: Perform Text, Metadata, And Full-Page Visual Verification

**Files:**
- Inspect: `output/pdf/codex-production-application-workflow-zh.pdf`
- Create temporarily: `tmp/pdfs/codex-workflow-page-*.png`
- Modify if needed: `docs/codex-production-application-workflow-zh.md`
- Modify if needed: `tools/build_codex_workflow_pdf.py`

- [ ] **Step 1: Inspect PDF metadata and page geometry**

Run:

```powershell
pdfinfo output\pdf\codex-production-application-workflow-zh.pdf
```

Expected: valid PDF metadata, A4 page size close to `595 x 842 pts`, no encryption, and a page count consistent with the structural test.

- [ ] **Step 2: Extract and scan all text**

Run:

```powershell
python -c "from pypdf import PdfReader; p='output/pdf/codex-production-application-workflow-zh.pdf'; t='\n'.join(x.extract_text() or '' for x in PdfReader(p).pages); print('pages=',len(PdfReader(p).pages),'chars=',len(t)); assert '\ufffd' not in t; assert 'TODO' not in t; assert 'TBD' not in t"
```

Expected: exit code `0`, no Unicode replacement characters, and no unfinished placeholders.

- [ ] **Step 3: Render every page to PNG**

Run:

```powershell
New-Item -ItemType Directory -Force tmp\pdfs | Out-Null
pdftoppm -png -r 130 output\pdf\codex-production-application-workflow-zh.pdf tmp\pdfs\codex-workflow-page
```

Expected: one readable PNG per PDF page with sequential filenames.

- [ ] **Step 4: Inspect every rendered page**

Review the PNGs in batches and check all of the following:

```text
cover balance
table of contents alignment and page numbers
Chinese glyph completeness
header and footer consistency
heading hierarchy
paragraph line spacing
code-block wrapping
table column widths and repeated headers
no clipped or overlapping content
no blank anomaly pages
no isolated heading at a page bottom
black-and-white readability
```

Expected: zero visible defects. Any defect requires editing the manuscript or builder, regenerating the PDF, rerunning the structural test, and rerendering all pages.

- [ ] **Step 5: Run the final verification suite**

Run:

```powershell
python tools\build_codex_workflow_pdf.py
python -m pytest tests\test_codex_workflow_pdf.py -v
pdfinfo output\pdf\codex-production-application-workflow-zh.pdf
```

Expected: all commands exit `0`; pytest reports `1 passed`; `pdfinfo` reports the expected A4 document.

### Task 5: Final Requirements Audit And Delivery

**Files:**
- Read: `docs/superpowers/specs/2026-07-10-codex-production-workflow-guide-design.md`
- Read: `docs/codex-production-application-workflow-zh.md`
- Read: `output/pdf/codex-production-application-workflow-zh.pdf`

- [ ] **Step 1: Audit every design requirement against the artifact**

Confirm all of these are present:

```text
technology-neutral positioning
twelve-stage end-to-end lifecycle
inputs/actions/human gates/artifacts/exit conditions
twenty or more working tips
fifteen or more failure corrections
ten reusable prompt templates
AGENTS.md template
Codex surface-selection guide
one-page workflow
production-readiness checklist
official source references
screen and grayscale-readable layout
```

Expected: every requirement maps to a manuscript heading or PDF page; no requirement is accepted solely because a build test passes.

- [ ] **Step 2: Remove temporary rendered images after successful inspection**

Use native PowerShell only after resolving and verifying that the target is exactly the workspace `tmp/pdfs` directory:

```powershell
$target=(Resolve-Path tmp\pdfs).Path
$workspace=(Resolve-Path .).Path
if (-not $target.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing cleanup outside workspace' }
Remove-Item -LiteralPath $target -Recurse -Force
```

Expected: temporary PNGs are removed while the final PDF, source Markdown, build script, test, design, and plan remain.

- [ ] **Step 3: Deliver the final artifacts**

Provide clickable absolute links to:

```text
D:\TeamFlow\output\pdf\codex-production-application-workflow-zh.pdf
D:\TeamFlow\docs\codex-production-application-workflow-zh.md
D:\TeamFlow\tools\build_codex_workflow_pdf.py
```

Report fresh evidence from the final build, pytest, `pdfinfo`, text scan, and visual inspection. Also disclose that the workspace cannot record a Git commit because its `.git` directory is not a valid repository.
