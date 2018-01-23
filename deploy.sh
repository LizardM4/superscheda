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
      
sed -e "s/%REV/${GIT_COMMIT}/g" -i "$1/index.html"
