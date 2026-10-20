#!/usr/bin/env python3
"""
AcquisitionOS workspace verification — path-by-path GitHub baseline check.

Compares EVERY path tracked by git HEAD against the physical workspace:
  - exists?
  - correct type (regular file / symlink)?
  - correct size?
  - correct git blob identity (sha1("blob <size>\\0" + content))?
  - executable bit for mode 100755?

Outputs (to --outdir):
  workspace-baseline-manifest.json   full per-file manifest
  workspace-missing-files.txt
  workspace-missing-directories.txt
  workspace-added-files.txt
  workspace-modified-files.txt

Usage:
  python3 verify_workspace.py [--repo /home/z/my-project] [--outdir DIR] [--label LABEL]
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time

GIT_EXCLUDES_FOR_ADDED_SCAN = {b".git"}


def git_ls_tree(repo: bytes):
    """Return list of (mode:bytes, otype:bytes, sha:bytes, size:int, path:bytes)."""
    out = subprocess.run(
        [b"git", b"ls-tree", b"-r", b"-z", b"-l", b"HEAD"],
        cwd=repo, capture_output=True, check=True,
    ).stdout
    entries = []
    for rec in out.split(b"\0"):
        if not rec:
            continue
        meta, _, path = rec.partition(b"\t")
        parts = meta.split()  # split on whitespace runs — size column is space-padded
        mode, otype, sha, size = parts[0], parts[1], parts[2], parts[3]
        entries.append((mode, otype, sha, None if size == b"-" else int(size), path))
    return entries


def blob_sha1(data: bytes) -> str:
    h = hashlib.sha1()
    h.update(b"blob %d\x00" % len(data))
    h.update(data)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="/home/z/my-project")
    ap.add_argument("--outdir", default="/home/z/my-project/download/workspace-verification")
    ap.add_argument("--label", default="workspace")
    ap.add_argument("--max-report", type=int, default=200,
                    help="max paths printed into txt reports (full lists kept in JSON)")
    ap.add_argument("--allow-modified", default="",
                    help="comma-separated tracked paths allowed to differ from HEAD "
                         "(e.g. session log worklog.md); still reported, but not gate failures")
    args = ap.parse_args()

    repo = os.fsencode(args.repo)
    outdir = args.outdir
    os.makedirs(outdir, exist_ok=True)

    t0 = time.time()
    entries = git_ls_tree(repo)
    print(f"[manifest] git ls-tree HEAD -> {len(entries)} tracked entries ({time.time()-t0:.1f}s)")

    tracked_dirs = set()
    for _, _, _, _, path in entries:
        d = os.path.dirname(path)
        while d and d not in tracked_dirs:
            tracked_dirs.add(d)
            d = os.path.dirname(d)
    print(f"[manifest] tracked directories: {len(tracked_dirs)}")

    missing_files, missing_dirs, modified, type_mismatch = [], [], [], []
    records = []
    n_checked = n_hashed = 0
    t1 = time.time()

    for mode, otype, sha, size, path in entries:
        fpath = os.path.join(repo, path)
        rec = {
            "path": path.decode("utf-8", "surrogateescape"),
            "mode": mode.decode(),
            "type": otype.decode(),
            "git_blob": sha.decode(),
            "git_size": size,
        }
        n_checked += 1
        if n_checked % 10000 == 0:
            print(f"  ... {n_checked}/{len(entries)} checked ({time.time()-t1:.1f}s)")

        # directory existence is checked separately
        if otype == b"tree":
            records.append({**rec, "status": "tree"})
            continue
        if otype == b"commit":  # submodule
            rec["status"] = "submodule"
            rec["disk_exists"] = os.path.isdir(fpath)
            records.append(rec)
            if not rec["disk_exists"]:
                missing_files.append(rec["path"])
            continue

        # --- regular file or symlink ---
        try:
            st = os.lstat(fpath)
        except OSError:
            rec["status"] = "MISSING"
            records.append(rec)
            missing_files.append(rec["path"])
            continue

        is_link = os.path.islink(fpath)
        expect_link = (mode == b"120000")
        rec["disk_size"] = st.st_size

        if expect_link != is_link:
            rec["status"] = "TYPE_MISMATCH"
            records.append(rec)
            type_mismatch.append(f"{rec['path']} (git mode {rec['mode']}, disk {'symlink' if is_link else 'regular file'})")
            continue

        # content identity
        try:
            if is_link:
                data = os.fsencode(os.readlink(fpath))
            else:
                with open(fpath, "rb") as fh:
                    data = fh.read()
        except OSError as e:
            rec["status"] = "READ_ERROR"
            rec["error"] = str(e)
            records.append(rec)
            modified.append(f"{rec['path']} (read error: {e})")
            continue
        n_hashed += 1
        disk_sha = blob_sha1(data)
        rec["disk_blob"] = disk_sha
        rec["blob_match"] = (disk_sha == sha.decode())
        if size is not None and not is_link:
            rec["size_match"] = (st.st_size == size)
        # executable bit for 100755
        if mode == b"100755" and not is_link:
            rec["executable"] = bool(st.st_mode & 0o111)

        problems = []
        if not rec["blob_match"]:
            problems.append("hash-mismatch")
        if not rec.get("size_match", True):
            problems.append("size-mismatch")
        if mode == b"100755" and not is_link and not rec.get("executable", True):
            problems.append("exec-bit-missing")
        if problems:
            rec["status"] = "MODIFIED(" + ",".join(problems) + ")"
            modified.append(f"{rec['path']} ({rec['status']})")
        else:
            rec["status"] = "OK"
        records.append(rec)

    print(f"[verify] checked {n_checked} entries, hashed {n_hashed} file contents ({time.time()-t1:.1f}s)")

    # --- directories ---
    for d in sorted(tracked_dirs):
        if not os.path.isdir(os.path.join(repo, d)):
            missing_dirs.append(d.decode("utf-8", "surrogateescape"))
    print(f"[verify] missing directories: {len(missing_dirs)}")

    # --- added (untracked) files scan ---
    tracked_set = set(p for _, _, _, _, p in entries)
    added = []
    t2 = time.time()
    for root, dirs, files in os.walk(repo):
        rb = os.fsencode(root)
        dirs[:] = [d for d in dirs if d not in GIT_EXCLUDES_FOR_ADDED_SCAN]
        for name in dirs:
            # detect whole untracked dirs compactly
            full = os.path.join(rb, name)
            rel = os.path.relpath(full, repo)
            if rel not in tracked_set and not any(t == rel or t.startswith(rel + b"/") for t in tracked_set):
                added.append(rel.decode("utf-8", "surrogateescape") + "/ (untracked dir)")
                dirs.remove(name)
        for f in files:
            rel = os.path.relpath(os.path.join(rb, f), repo)
            if rel not in tracked_set:
                added.append(rel.decode("utf-8", "surrogateescape"))
    print(f"[verify] untracked/added scan: {len(added)} entries ({time.time()-t2:.1f}s)")

    # --- write reports ---
    summary = {
        "label": args.label,
        "repo": args.repo,
        "git_head": subprocess.run(["git", "rev-parse", "HEAD"], cwd=args.repo,
                                   capture_output=True, text=True, check=True).stdout.strip(),
        "tracked_entries": len(entries),
        "tracked_files": sum(1 for e in entries if e[1] in (b"blob",)),
        "tracked_directories": len(tracked_dirs),
        "checked": n_checked,
        "hashed_files": n_hashed,
        "missing_files": len(missing_files),
        "missing_directories": len(missing_dirs),
        "type_mismatches": len(type_mismatch),
        "modified_files": len(modified),
        "added_untracked": len(added),
        "elapsed_sec": round(time.time() - t0, 1),
    }

    with open(os.path.join(outdir, "workspace-baseline-manifest.json"), "w") as fh:
        json.dump({"summary": summary, "files": records}, fh, ensure_ascii=True)

    def wtxt(name, items, header):
        with open(os.path.join(outdir, name), "w") as fh:
            fh.write(header + f"\ntotal: {len(items)}\n")
            for item in items[: args.max_report]:
                fh.write(item + "\n")
            if len(items) > args.max_report:
                fh.write(f"... ({len(items) - args.max_report} more, see JSON manifest)\n")

    wtxt("workspace-missing-files.txt", missing_files,
         "# GitHub-tracked files NOT physically present in workspace")
    wtxt("workspace-missing-directories.txt", missing_dirs,
         "# GitHub-tracked directories NOT physically present in workspace")
    wtxt("workspace-modified-files.txt", type_mismatch + modified,
         "# GitHub-tracked files whose disk content/type/mode does not match git HEAD")
    wtxt("workspace-added-files.txt", added,
         "# Files/dirs present in workspace but NOT tracked by GitHub HEAD (platform/tooling artifacts expected)")

    print("\n==== VERIFICATION SUMMARY ====")
    for k, v in summary.items():
        print(f"  {k}: {v}")

    gate_ok = (len(missing_files) == 0 and len(missing_dirs) == 0
               and len(type_mismatch) == 0 and len(modified) == 0)
    if gate_ok is False and args.allow_modified:
        allowed = [p.strip() for p in args.allow_modified.split(",") if p.strip()]
        mod_paths = {m.split(" (")[0] for m in modified}
        only_allowed = mod_paths.issubset(set(allowed))
        if only_allowed:
            gate_ok = True
            print(f"[gate] modified files are all in the documented allow-list: {sorted(mod_paths)}")
    print("\nGATE:", "PASS — 0 missing files, 0 missing directories, 0 modified tracked files"
          if gate_ok else "FAIL")
    return 0 if gate_ok else 1


if __name__ == "__main__":
    sys.exit(main())
