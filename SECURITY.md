# Security

The adapter is a local, read-only viewer. It is not a multi-user web service and does not add authentication on top of OpenMausBot's loopback API. Any process/browser with access on the same Mac may be able to read bot data; Host/Origin checks are additional browser boundaries, not protection against a compromised local machine.

Keep the server bound to 127.0.0.1. Do not publish or proxy the live adapter. Only fictional `--demo` output should appear in public screenshots and reports.

The API explicitly projects metadata and configuration fields, returns no conversation message bodies, performs only upstream GET requests, and does not write live data to disk. Soul and skill instructions can themselves contain private information; treat live inspector output as private. Browser local storage retains team names and layout positions until that site's data is cleared.

To report a vulnerability, use the repository's GitHub **Security → Report a vulnerability** option if available. If that option is unavailable, open a minimal issue asking for a private contact route without disclosing exploit details, secrets, or personal data. Do not attach live bot snapshots to public issues.
