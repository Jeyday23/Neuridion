<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [kodex-v4] recent context, 2026-04-30 5:20pm GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (17,393t read) | 891,567t work | 98% savings

### Apr 15, 2026
5 11:53a 🔵 ScrapedFsn Type Not Found in lib/scrapers/
6 " 🔵 bfarm.ts Exports FsnItem Not ScrapedFsn — Type Mismatch with MHRA Scraper
7 " 🔵 ScrapedFsn Type Used Nowhere — Only FsnItem Consumed by Existing Code
S8 Unified ScrapedFsn Type in bfarm.ts — FsnItem Deprecated as Alias (Apr 15 at 11:53 AM)
8 11:55a 🔴 Unified ScrapedFsn Type in bfarm.ts — FsnItem Deprecated as Alias
S9 bfarm.ts scrapeBfArM Updated to Populate All ScrapedFsn Fields (Apr 15 at 11:55 AM)
9 " 🔴 bfarm.ts scrapeBfArM Updated to Populate All ScrapedFsn Fields
S10 mhra.ts Scraper File Created and Written to Disk (Apr 15 at 11:55 AM)
10 " 🟣 mhra.ts Scraper File Created and Written to Disk
S11 TypeScript Compilation Passes with Zero Errors After ScrapedFsn Unification (Apr 15 at 11:55 AM)
11 " 🔵 TypeScript Compilation Passes with Zero Errors After ScrapedFsn Unification
S12 search-runs API Route Uses Supabase Server Client (Apr 15 at 11:55 AM)
12 11:59a 🔵 search-runs API Route Uses Supabase Server Client
S13 search-runs Route: Full 7-Step Pipeline for Medical Device FSN Search (Apr 15 at 11:59 AM)
13 " 🔵 search-runs Route: Full 7-Step Pipeline for Medical Device FSN Search
S14 MHRA Scraper Added as Second FSN Data Source Alongside BfArM (Apr 15 at 11:59 AM)
14 " 🟣 MHRA Scraper Added as Second FSN Data Source Alongside BfArM
S15 Fixed Type and Source Field Bugs When Inserting Multi-Source FSN Results (Apr 15 at 11:59 AM)
15 " 🔴 Fixed Type and Source Field Bugs When Inserting Multi-Source FSN Results
S16 stage1Filter Uses Claude claude-sonnet-4-5 to Classify FSN Relevance Against Product Profiles (Apr 15 at 11:59 AM)
16 12:00p 🔵 stage1Filter Uses Claude claude-sonnet-4-5 to Classify FSN Relevance Against Product Profiles
S17 User confirmed "yes" to an unknown prompt — Claude had no pending question (Apr 15 at 12:04 PM)
### Apr 29, 2026
34 9:25a ✅ Deploy verification prompt rewritten for non-Claude-Code agents (Codex/Cursor)
35 9:28a ⚖️ Human-agent responsibility split defined for production deploy verification
36 9:32a 🔵 Production URL confirmed for kodex-4-medical
37 " 🔵 Production URL DNS resolution failed during old-route 404 check
38 " 🔵 Old /api/stripe/checkout route returns 500, not 404 — H2 hard stop condition triggered
### Apr 30, 2026
39 11:15a ✅ Git hygiene cleanup: .gitignore, settings, and stale files
40 " 🟣 PrototypeBanner component added to root layout in worktree branch
41 " 🔵 kodex-v4 project tech stack and Supabase project ID confirmed
42 " 🔵 Review skill loops indefinitely because cleanup changes are never committed to git
43 " 🔵 kodex-v4 environment variable inventory
44 12:40p 🔵 kodex-v4 .env.example canonical variable list
45 12:43p 🔵 kodex-v4 .env.example updated with OPENFDA_API_KEY docs and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
46 12:49p ⚖️ Production secrets confirmed safe in Render; rotation planned post-prototype
47 1:47p 🔵 Swissmedic scraper returns HTTP 404 on FSCA listing page — search yields 0 results
48 " 🔵 Swissmedic scraper architecture and 404 root cause identified
49 " 🔵 Swissmedic FSCA moved to dedicated Angular SPA at fsca.swissmedic.ch/mep/
50 1:48p 🔵 Swissmedic MEP Angular SPA JS bundle downloaded for API endpoint extraction
51 " 🔵 Swissmedic scraper fix not yet deployed to Render production
52 2:00p 🔵 Swissmedic REST API confirmed live — returns 297 real FSCA records for 2024-01-01→2024-06-01
53 " 🔄 swissmedic.ts interfaces tightened with MaybeString type alias to match real API nulls
54 " ✅ AGENTS.md replaced with minimal Next.js version-warning stub
55 " 🔵 Local npm run build fails due to Google Fonts network block — not a code error
56 2:01p 🔵 Production build passes cleanly — all 38 routes compile with zero errors
57 " 🔵 AGENTS.md not appearing in git status despite patch being applied — net diff is empty
58 2:04p 🔵 Search pipeline architecture: coverage-aware incremental scraping with canonical dedup and AI filter
59 2:05p 🔵 Search UI has Swissmedic listed as active database but formatSourceLabel missing its label
60 " 🔴 Coverage merge now conditional on scraper success and canonical persistence
61 " 🔴 Swissmedic scraper now emits warning when MAX_PAGES cap is hit mid-pagination
62 " 🔵 All changed files pass TypeScript and ESLint — ready to commit
63 2:06p 🔴 formatSourceLabel fixed — Swissmedic and FDA source labels now display correctly in search results UI
64 " ⚖️ User halts review loop and issues precise git add commands
65 2:19p 🔵 git index.lock blocks all staging operations in kodex-v4
66 2:20p 🔵 git index.lock does not exist — git add blocked by sandbox permissions
67 " 🔵 exec_command sandbox confirmed blocking git write ops despite correct ownership
68 " 🔵 macOS file flags confirmed absent on .git — sandbox is the write blocker
69 3:11p 🔵 AGENTS.md Has 79 Blank-Line Insertions, No Substantive Content Added
70 4:00p 🔵 ESLint Audit: 7 Errors and 8 Warnings Found in kodex-v4
71 " 🔵 kodex-v4 Tech Stack: Next.js 16, React 19, Supabase, Stripe, Anthropic SDK

Access 892k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>