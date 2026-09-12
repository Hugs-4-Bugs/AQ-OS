#!/bin/bash
# Double-fork daemon pattern
(
    # First fork - child
    cd /home/z/my-project
    setsid node .next/standalone/server.js </dev/null >> /home/z/my-project/dev.log 2>&1 &
    # Second fork exits immediately, grandchild is fully detached
    exit 0
) &
exit 0
