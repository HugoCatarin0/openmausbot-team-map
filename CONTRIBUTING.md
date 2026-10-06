# Contributing

Keep this project small: a static browser UI and a Python standard-library adapter. Propose new dependencies before adding them.

Use `python3 server.py --demo --open` while working on the UI. All examples, fixtures, screenshots, and bug reports must use fictional data. Do not commit real bot exports, private instruction files, conversation transcripts, personal paths, or credentials. Review `git diff --cached` before pushing; ignored files already tracked by Git remain tracked.

Before opening a pull request, run `python3 -m unittest discover -s tests -v` and, if Node is available, `node --check dist/app.js`. Check the changed behavior in the browser. Explain what changed and how it was verified. API changes must preserve read-only access, explicit field projection, and loopback/origin guards.

For bug reports, include the OpenMausBot/Python/browser versions, steps using demo data when possible, and the observed result. Replace private values with clear placeholders. For new features, explain the workflow they improve.

Report potential data disclosure privately using the route described in SECURITY.md.
