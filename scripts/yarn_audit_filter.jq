# Input: `yarn audit --json` slurped (-s). Fails on any advisory whose ID is not in $ignore.
if any(.[]; .type == "auditSummary") | not then error("yarn audit returned no summary") else . end
| [.[] | select(.type == "auditAdvisory") | .data.advisory | select(.id | IN($ignore[]) | not)]
| unique_by(.id)
| (.[] | "\(.severity)\t\(.module_name)\t\(.id)\t\(.url)"),
  (if length > 0
   then error("\(length) advisories not in frontend/.yarn-audit-ignore")
   else "No advisories outside frontend/.yarn-audit-ignore"
   end)
