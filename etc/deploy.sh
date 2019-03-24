#!/bin/bash

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <destination>"
    exit
fi

GIT_COMMIT="$(git rev-parse --short HEAD)"

rsync --archive \
      --recursive \
      --verbose \
      --exclude=.\* \
      --exclude=\*.sh \
      --exclude=LICENSE.txt \
      --delete \
      "$(pwd)/" "$1"

REPLACE_CMD="s/%REV/${GIT_COMMIT}/g"

find "$1/js/" -name \*.js -exec sed -e "$REPLACE_CMD" -i {} \;
sed -e "$REPLACE_CMD" -i "$1/index.html"
