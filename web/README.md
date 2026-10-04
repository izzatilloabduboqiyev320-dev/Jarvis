# JARVIS online (claude.ai artifact)

`jarvis.template.html` is the hosted version of JARVIS: the knowledge graph plus a chat that talks to Claude through the claude.ai artifact `sample` capability (the viewer's own Claude account, no API key).

Build: `npx tsx scripts/export-web.ts /tmp/data.json`, then replace `__DATA__` in the template with that JSON and publish the result as an artifact with `capabilities: {sample: {}}`.
Live link: https://claude.ai/artifact/G9e5CWDesN7SpD9HeE19Pp
