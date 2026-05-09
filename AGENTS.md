<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


<claude-mem-context>
# Memory Context

# [NEURIDION] recent context, 2026-05-07 7:30pm GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (14,673t read) | 204,474t work | 93% savings

### May 7, 2026
S128 Implement p-limit concurrency refactor for AI filter loop in run-search.ts (May 7 at 12:15 PM)
715 12:17p 🟣 p-limit Import Added to run-search.ts for Concurrency Refactor
716 " 🟣 AI Filter Loop Replaced with p-limit Concurrency Fan-out
S129 Commit p-limit AI filter parallelization — performance refactor shipped to main (May 7 at 12:17 PM)
717 12:18p 🟣 AI Filter Concurrency Refactor Committed to main
S130 Create and commit DB-level append-only enforcement for filter_decisions table (May 7 at 12:18 PM)
718 " 🔵 Supabase Migration Sequence: Latest is 031
719 12:19p 🟣 filter_decisions Table Made Append-Only via PostgreSQL Rules
720 " 🟣 Append-Only filter_decisions Migration Committed to main
S131 Push NEURIDION commits to GitHub origin/main (Kodex-4-Medical repository) (May 7 at 12:19 PM)
721 12:25p ✅ NEURIDION pushed to GitHub main branch
S132 Push NEURIDION commits to GitHub and verify live Supabase migration 032 status (May 7 at 12:25 PM)
722 12:27p 🔵 NEURIDION working tree has sensitive and untracked artifacts not committed to git
723 12:28p 🔵 Append-only rules already active on live Supabase filter_decisions table
S133 Three security fixes: clean credentials from .claude/settings.json, delete dead Stripe webhook, add search_runs DELETE RLS policy — then apply migration to production (May 7 at 12:28 PM)
724 12:45p 🚨 Hardcoded Supabase Credentials Found in .claude/settings.json Allow List
725 " 🔴 Deleted Dead Stripe Webhook Route That Silently Dropped Events
726 " 🟣 Added DELETE RLS Policy to search_runs Table via Migration 033
727 " 🔵 .claude/settings.json Was Not in .gitignore
728 12:46p 🔐 Removed Three Hardcoded Supabase Credential Entries from settings.json Allow List
729 " 🚨 .claude/settings.json Was Already Tracked by Git — Credentials Exist in Git History
730 " 🔐 Untracked .claude/settings.json from Git Without Deleting the File
731 " 🔴 Deleted Dead Stripe Webhook Route app/api/stripe/webhook/route.ts
732 12:47p 🔵 Stale .next Build Cache References Deleted Stripe Webhook Route
733 " 🔵 TypeScript Clean After Stripe Webhook Deletion When Excluding Stale Next.js Cache
734 " 🟣 Created Migration 033 Adding DELETE RLS Policy to search_runs
735 " 🔵 Git Status Confirms All Three Changes Staged Correctly; Untracked Claude-Flow Artifacts Present
736 " ✅ Security Commit 92fc57d Landed on Main Branch
737 " ✅ Migration 033 Applied to Live Supabase Database via MCP
S134 Archive table and search panel UX polish: fix status labels, DB display names, date formatting, remove console.logs, sanitize error messages, fix draft toast (May 7 at 12:48 PM)
738 12:49p ✅ Security Commit 92fc57d Pushed to GitHub Remote
739 " 🔵 Archive Page Uses Admin Client to Bypass RLS for search_runs Reads
740 " 🟣 Added pending and degraded Status Support to Archive Table with Human-Readable Labels
741 " 🟣 Archive Table Status Badge Now Renders Human-Readable Labels Instead of Raw DB Values
742 12:50p 🔴 Archive Table Period Column Now Formats Dates via fmtDate Instead of Raw ISO Strings
743 " 🟣 Archive Table DBs Column Now Shows Branded Database Names via DB_LABELS Map
744 " 🔄 Removed Debug console.log Statements from Archive Page
745 " 🔴 Archive Page Error Message No Longer Exposes Internal Migration Details to Users
746 " 🔴 saveDraft Default Toast Message Hardcoded to Fix Potential i18n Hook Timing Issue
747 12:51p ✅ Six Archive/Search UX Fixes Committed as 2400f05
S135 Security + UX polish: remove misleading button, expand i18n jargon, add Zod validation to 3 API routes — TypeScript check and commit (May 7 at 12:51 PM)
748 12:52p ✅ UX Fix Commit 2400f05 Pushed to GitHub Main Branch
749 " 🔵 Profiles Page Exposes Raw Supabase Error Message and API Uses Session Client with RLS
750 " 🔵 Two Overly Technical i18n Strings Found: "PMS search" and "No FSNs found"
751 12:53p 🔴 Removed Confusingly Labeled "Create Profile" Button from Search Panel Action Bar
752 " 🔵 i18n.ts createProfile Key Now Dead Code After Button Removal
753 " ✅ Expanded Abbreviations in Two User-Facing i18n Strings
754 " ✅ Profiles Page Empty State Copy Updated to Remove "recall searches" Wording
755 " 🟣 Added Zod Input Validation Schema to Profiles API POST Endpoint
756 " 🟣 Added Zod Input Validation Schema to Search Drafts API POST Endpoint
757 12:54p 🟣 Zod Validation Wired Into Both profiles and search-drafts API POST Handlers
S136 Connect Microsoft Foundry API key to Claude Code (May 7 at 12:56 PM)
758 4:02p ✅ User Requested Microsoft Foundry API Key Integration with Claude Code
759 4:04p 🔵 Official Claude Code Documentation for Microsoft Foundry Integration Found
760 " 🔵 Claude Code LLM Gateway Config: Key Environment Variables for Custom API Endpoints
761 " 🔵 Microsoft Foundry-Specific Env Vars for Claude Code Confirmed
762 " 🔵 Current ~/.claude/settings.json State Before Foundry Configuration
S137 Connect Microsoft Azure AI Foundry API key to Claude Code — researching config and awaiting user's endpoint details (May 7 at 4:04 PM)
763 4:07p ✅ Azure Foundry Endpoint Added to ~/.claude/settings.json
764 4:29p 🚨 Exposed API Key in Session Context

Access 204k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>