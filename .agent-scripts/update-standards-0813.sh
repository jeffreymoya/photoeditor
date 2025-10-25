#!/bin/bash
# TASK-0813: Update standards files with purity & immutability heuristics

set -e

cd /home/jeffreymoya/dev/photoeditor

echo "Backing up original standards files..."
cp standards/typescript.md standards/typescript.md.bak-0813
cp standards/backend-tier.md standards/backend-tier.md.bak-0813
cp standards/frontend-tier.md standards/frontend-tier.md.bak-0813
cp standards/cross-cutting.md standards/cross-cutting.md.bak-0813

echo "Standards files backed up with .bak-0813 extension"
echo "You can now manually edit the files or restore from backups if needed"
