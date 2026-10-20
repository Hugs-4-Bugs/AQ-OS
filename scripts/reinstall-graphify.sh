#!/bin/bash
# Reinstall Graphify after a sandbox reactivation (the venv at /home/z/.venv is ephemeral).
# The wheel is vendored in this workspace; tree-sitter deps come from PyPI (reachable).
# Offline fallback: if PyPI is unreachable, deps can be re-fetched from
#   https://github.com/safishamsi/graphify (same source the wheel was built from).
set -e
cd "$(dirname "$0")"
python3 -m pip install vendor/graphifyy-0.9.92-py3-none-any.whl
python3 -m pip install -r vendor/graphify-deps-freeze.txt
echo "graphify reinstall OK:"
command -v graphify && graphify --help | head -3
