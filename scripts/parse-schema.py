#!/usr/bin/env python3
"""Parse prisma/schema.prisma into structured markdown fragments for docs."""
import re, json

SCHEMA = '/home/z/my-project/prisma/schema.prisma'

with open(SCHEMA) as f:
    lines = f.readlines()

models = []
current = None

for i, line in enumerate(lines):
    m = re.match(r'^model (\w+) \{', line)
    if m:
        current = {'name': m.group(1), 'line': i + 1, 'fields': [], 'relations': [], 'indexes': []}
        models.append(current)
        continue
    if current is not None:
        if re.match(r'^\}', line):
            current = None
            continue
        # attribute lines
        idx = re.match(r'\s*(@@index|@@unique)\((.*)\)', line)
        if idx:
            current['indexes'].append(f"{idx.group(1)}({idx.group(2).strip()})")
            continue
        # field lines: name type attrs
        fm = re.match(r'\s{2}(\w+)\s+(\??[\w\[\]]+|\??\w+)(.*)', line)
        if fm:
            fname, ftype, rest = fm.group(1), fm.group(2), fm.group(3).strip()
            is_rel = '@relation' in rest or (ftype[0].isupper() and 'String' not in ftype and 'DateTime' not in ftype and 'Int' not in ftype and 'Float' not in ftype and 'Boolean' not in ftype)
            comment = ''
            cm = re.search(r'//\s*(.*)', rest)
            if cm:
                comment = cm.group(1).strip()
            entry = {'name': fname, 'type': ftype, 'attrs': rest.split('//')[0].strip()}
            if is_rel:
                current['relations'].append(entry)
            else:
                current['fields'].append(entry)
            if comment:
                entry['comment'] = comment

out = {'models': models}
with open('/home/z/my-project/scripts/schema-parsed.json', 'w') as f:
    json.dump(out, f, indent=1)

print(f"Parsed {len(models)} models")
for m in models:
    print(f"{m['name']}: {len(m['fields'])} fields, {len(m['relations'])} relations, line {m['line']}")
