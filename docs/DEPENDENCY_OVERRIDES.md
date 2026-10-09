# Dependency maintenance

Next.js and its ESLint configuration are pinned together at 16.4.0. The lockfile
also updates vulnerable transitive packages, including sharp and source-map-js.

The scoped npm override replaces `@next/eslint-plugin-next`'s `fast-glob` dependency
with `tinyglobby` 0.2.17. This removes the vulnerable `micromatch` / `braces` chain
(GHSA-vfj7-8cjw-p6xm), for which braces has no patched release at the time of this
change. Next's plugin only calls `globSync(pattern, { onlyDirectories: true })`;
tinyglobby supports this API. The regression test exercises the installed Next
plugin's directory discovery, including brace patterns and arrays. Tinyglobby
returns relative directory paths with a trailing slash; the plugin's sole consumer
joins them with `pages` / `app` and checks the filesystem, so they resolve to the
same directories. The tests compare resolved directory identities.

Keep this override scoped to the Next ESLint plugin. Reevaluate it when upgrading
Next: remove it once upstream no longer requires the vulnerable chain, or ships a
patched dependency. Do not suppress npm audit findings to remove the override.

The required CI security gate remains `npm audit --audit-level=high` plus package
signature verification. Lower-severity findings remain visible: currently the
ExcelJS transitive uuid advisory and the development esbuild Windows-server
advisory. Resolving these requires upstream-compatible updates; this change does
not downgrade ExcelJS or change its report output API.
