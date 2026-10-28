"""Checks that every endpoint in the code is in DATA_MODELS_AND_APIS.md and vice versa.
Run from backend-python/:  python ../docs/check_docs.py"""
import re, sys
sys.path.insert(0, ".")
import main

norm = lambda p: re.sub(r"\{[^}]*\}", "{}", p.split("?")[0])
doc = open("../docs/DATA_MODELS_AND_APIS.md", encoding="utf-8").read()

documented = set()
for line in doc.splitlines():
    m = re.match(r"\| `(GET|POST|PUT|DELETE)(?: and (\w+))? (/api/[^`\s]+)`(?: / `(\w[\w-]*)`)?", line)
    if m:
        method, method2, path, alt = m.groups()
        paths = [path]
        if alt:                                   # "`POST /a/enable` / `disable`" shorthand
            paths.append(path.rsplit("/", 1)[0] + "/" + alt)
        for p in paths:
            documented.add((method, norm(p)))
    else:                                         # admin table rows: "| `GET /api/admin/x` | ..."
        m = re.match(r"\| `(GET|POST|PUT|DELETE) (/api/[^`\s]+)`(?: / `(\w[\w-]*)`)?", line)
for line in doc.splitlines():                     # "GET ... / PUT ..." in one cell
    m = re.match(r"\| `(GET) (/api/\S+)` / `(PUT) (/api/\S+)`", line)
    if m:
        documented.add((m[1], norm(m[2]))); documented.add((m[3], norm(m[4])))
code = {(m.upper(), norm(p)) for p, ops in main.app.openapi()["paths"].items() for m in ops}
print("endpoints in code:", len(code), "| documented:", len(documented))
print("in code, not documented:", sorted(code - documented))
print("documented, not in code:", sorted(documented - code))
sys.exit(1 if code != documented else 0)
