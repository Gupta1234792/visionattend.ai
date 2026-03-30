#!/bin/sh
set -eu

PORT_TO_USE="${PORT:-10000}"
exec gunicorn -b "0.0.0.0:${PORT_TO_USE}" --timeout 120 --workers 1 main:app
