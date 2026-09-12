#!/usr/bin/env python3
"""Aggregate + dedupe scoped tsc logs; classify Prisma-schema-caused errors."""
import re, collections, json

logs = ['tsc-app.log', 'tsc-components.log', 'tsc-lib.log']
pat = re.compile(r'^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$')
errors = {}
for lg in logs:
    try:
        with open(f'/home/z/my-project/{lg}', encoding='utf-8', errors='replace') as f:
            for line in f:
                m = pat.match(line.strip())
                if m:
                    key = (m.group(1), m.group(2), m.group(4))
                    errors.setdefault(key, m.group(5))
    except FileNotFoundError:
        pass

print(f'TOTAL UNIQUE ERRORS: {len(errors)}')

# Classification
missing_model = []      # db.<model> — property missing on PrismaClient-ish
missing_field = []      # property missing on a model row type / WhereInput
other = collections.Counter()
prop_re = re.compile(r"Property '([^']+)' does not exist on type '([^']+)'\.")
prop_re2 = re.compile(r"Object literal may only specify known properties, and? ?'([^']+)' does not exist in type '([^']+)'\.")
prop_re3 = re.compile(r"Property '([^']+)' is missing in type '([^']+)'")
model_targets = collections.Counter()
field_targets = collections.Counter()
missing_props = collections.Counter()

for (f, l, code), msg in errors.items():
    m = prop_re.match(msg) or prop_re2.match(msg)
    if m and code in ('TS2339', 'TS2353', 'TS2561', 'TS2551'):
        prop, tgt = m.group(1), m.group(2)
        missing_props[prop] += 1
        # PrismaClient / transaction client targets -> missing model
        if 'PrismaClient' in tgt or 'TransactionClient' in tgt or tgt in ('PrismaClient',):
            missing_model.append((f, l, prop, tgt))
            model_targets[prop] += 1
        else:
            missing_field.append((f, l, prop, tgt))
            field_targets[tgt.split('{')[0].strip()[:60]] += 1
    else:
        other[code] += 1

print('\n=== MISSING PRISMA MODELS (db.<model>) — top 30 ===')
for p, c in model_targets.most_common(30):
    print(f'{c:4d}  {p}')
print(f'\nmissing-model error count: {len(missing_model)}')

print('\n=== MISSING FIELDS BY TARGET TYPE — top 30 ===')
for t, c in field_targets.most_common(30):
    print(f'{c:4d}  {t}')
print(f'\nmissing-field error count: {len(missing_field)}')

print('\n=== OTHER ERROR CODES ===')
for c, n in other.most_common(20):
    print(f'{n:4d}  {c}')

# Save full deduped list for fix work
with open('/home/z/my-project/tsc-all.json', 'w') as f:
    json.dump([{'file': k[0], 'line': int(k[1]), 'code': k[2], 'msg': v} for k, v in errors.items()], f, indent=1)
print('\nsaved -> tsc-all.json')
